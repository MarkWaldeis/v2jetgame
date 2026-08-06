import * as THREE from 'three';
import { CONFIG } from '../config';

/**
 * War Thunder Chase-Kamera:
 * - Hinter + leicht über dem Jet
 * - Horizon-Lock (World-Up dominant, ~15–20% Roll-Coupling)
 * - Spring-Damper Lag
 * - Free-Look Hold mit weichem Return (0.3 s)
 * - Dynamisches FOV + Speed Pull-Back + Shake
 */
export class CameraController {
  mode: 'chase' | 'cockpit' | 'free' = 'chase';
  private modeBeforeFree: 'chase' | 'cockpit' = 'chase';

  private currentPos = new THREE.Vector3(0, 620, 3200);
  private currentFwd = new THREE.Vector3(0, 0, -1);
  private currentUp = new THREE.Vector3(0, 1, 0);
  private ready = false;
  private trackBlend = 0;

  private freeYaw = 0;
  private freePitch = 0.25;
  private freeDist = 28;

  /** Free-Look Hold-State + Return-Slerp */
  private freeLookActive = false;
  private freeReturnT = 1; // 0 = start return, 1 = fertig
  private freeReturnFrom = new THREE.Vector3();
  private freeReturnFromQuat = new THREE.Quaternion();
  private freeReturnDur = 0.3;

  private shakeTime = 0;
  private shakeAmp = 0;

  /** Geglättete dynamische Roll-Kopplung (0..1) */
  private rollFollowSmoothed = 0.14;
  private bankSmoothed = 0;

  private _fwd = new THREE.Vector3();
  private _right = new THREE.Vector3();
  private _up = new THREE.Vector3();
  private _jetUp = new THREE.Vector3();
  private _desired = new THREE.Vector3();
  private _look = new THREE.Vector3();
  private _worldUp = new THREE.Vector3(0, 1, 0);
  private _shake = new THREE.Vector3();
  private _quat = new THREE.Quaternion();

  private buildChaseBasis(jet: THREE.Object3D, rollFollow: number) {
    this._fwd.set(0, 0, -1).applyQuaternion(jet.quaternion);
    if (this._fwd.lengthSq() < 1e-8) this._fwd.set(0, 0, -1);
    else this._fwd.normalize();

    // Roll-freie Right/Up (Horizont-stabil)
    this._right.crossVectors(this._worldUp, this._fwd);
    if (this._right.lengthSq() < 1e-6) {
      this._right.set(1, 0, 0);
    } else {
      this._right.normalize();
    }
    this._up.crossVectors(this._fwd, this._right).normalize();

    // Leichte Roll-Kopplung (~15–20 %)
    if (rollFollow > 0.001) {
      this._jetUp.set(0, 1, 0).applyQuaternion(jet.quaternion).normalize();
      this._up.lerp(this._jetUp, THREE.MathUtils.clamp(rollFollow, 0, 1)).normalize();
      this._right.crossVectors(this._up, this._fwd).normalize();
      this._up.crossVectors(this._fwd, this._right).normalize();
    }
  }

  private buildNoRollBasis(jet: THREE.Object3D) {
    this.buildChaseBasis(jet, 0);
  }

  /**
   * @param freeLookHeld  C/RMB gehalten
   * @param gForce        für High-G Pull-In
   * @param afterburner   WEP Shake / FOV
   * @param firing        Kanonen-Shake
   * @param stalled       Stall-Shake
   * @param airbrake      Kamera näher
   * @param camFit        Per-Jet Distanz/Höhe (Fadenkreuz frei vor dem Rumpf)
   */
  update(
    dt: number,
    jet: THREE.Object3D,
    speed: number,
    camera: THREE.PerspectiveCamera,
    lookDelta?: { x: number; y: number },
    trackTargetWorld?: THREE.Vector3 | null,
    extras?: {
      freeLookHeld?: boolean;
      gForce?: number;
      afterburner?: boolean;
      firing?: boolean;
      stalled?: boolean;
      airbrake?: boolean;
      camFit?: { distScale?: number; heightScale?: number; lookDownBias?: number };
      /** Aktuelle Roll-Rate (rad/s) für dynamische Kamera-Bank */
      rollRate?: number;
      /** Bank −1..1 */
      bank?: number;
      /** 0..1+ Buffeting vor Stall / Wing Flutter (ältere Zellen stärker) */
      buffeting?: number;
    }
  ) {
    const C = CONFIG.camera;
    const freeHeld = extras?.freeLookHeld ?? false;
    const gForce = extras?.gForce ?? 1;
    const afterburner = extras?.afterburner ?? false;
    const firing = extras?.firing ?? false;
    const stalled = extras?.stalled ?? false;
    const airbrake = extras?.airbrake ?? false;
    const camFit = extras?.camFit;
    const rollRate = extras?.rollRate ?? 0;
    const bank = extras?.bank ?? 0;
    const buffeting = extras?.buffeting ?? 0;

    // Free-Look Hold
    this.updateFreeLookState(freeHeld, camera);

    // FOV: 60° Cruise → 75–80° WEP
    const speedNorm = THREE.MathUtils.clamp(
      (speed - CONFIG.flight.cruiseSpeed) /
        (CONFIG.flight.afterburnerSpeed - CONFIG.flight.cruiseSpeed),
      0,
      1
    );
    let fovTarget = C.baseFov + speedNorm * C.maxFovBoost;
    if (afterburner) fovTarget += 2;
    if (airbrake || gForce > 5) fovTarget -= 3;
    camera.fov += (fovTarget - camera.fov) * Math.min(1, dt * 4);
    camera.updateProjectionMatrix();

    // Shake amplitude
    let targetShake = 0;
    if (speedNorm > 0.7) targetShake += C.shakeSpeed * speedNorm;
    if (afterburner) targetShake += C.shakeWep;
    if (firing) targetShake += C.shakeFire;
    if (stalled) targetShake += C.shakeStall;
    // Pre-stall buffeting / wing flutter
    if (buffeting > 0.05) targetShake += C.shakeStall * buffeting * 0.85;
    this.shakeAmp += (targetShake - this.shakeAmp) * Math.min(1, dt * 8);
    this.shakeTime += dt;

    if (this.freeLookActive || this.mode === 'free') {
      this.updateFree(dt, jet, camera, lookDelta);
      this.trackBlend = 0;
      this.applyShake(camera);
      return;
    }

    // Soft return from free-look
    if (this.freeReturnT < 1) {
      this.freeReturnT = Math.min(1, this.freeReturnT + dt / this.freeReturnDur);
      const t = smoothstep(this.freeReturnT);
      // Chase-Ziel berechnen und slerp von freeReturnFrom
      this.updateChaseCore(
        dt, jet, speed, camera, trackTargetWorld, gForce, airbrake, afterburner, true, camFit, rollRate, bank
      );
      camera.position.lerpVectors(this.freeReturnFrom, this.currentPos, t);
      this._quat.copy(camera.quaternion);
      camera.quaternion.slerpQuaternions(this.freeReturnFromQuat, this._quat, t);
      this.applyShake(camera);
      return;
    }

    if (this.mode === 'cockpit') {
      const offset = new THREE.Vector3(0, 0.95, -2.55)
        .applyQuaternion(jet.quaternion)
        .add(jet.position);
      camera.position.copy(offset);
      const want = trackTargetWorld ? 0.55 : 0;
      this.trackBlend += (want - this.trackBlend) * Math.min(1, dt * 4);
      if (this.trackBlend > 0.02 && trackTargetWorld) {
        this.buildNoRollBasis(jet);
        camera.up.copy(this._up);
        const bore = camera.position.clone().addScaledVector(this._fwd, 80);
        camera.lookAt(bore.lerp(trackTargetWorld, this.trackBlend));
      } else {
        camera.quaternion.copy(jet.quaternion);
        camera.up.set(0, 1, 0).applyQuaternion(jet.quaternion).normalize();
        camera.rotateX(-0.05);
      }
      this.ready = false;
      this.applyShake(camera);
      return;
    }

    this.updateChaseCore(
      dt, jet, speed, camera, trackTargetWorld, gForce, airbrake, afterburner, false, camFit, rollRate, bank
    );
    this.applyShake(camera);
  }

  private updateChaseCore(
    dt: number,
    jet: THREE.Object3D,
    speed: number,
    camera: THREE.PerspectiveCamera,
    trackTargetWorld: THREE.Vector3 | null | undefined,
    gForce: number,
    airbrake: boolean,
    afterburner: boolean,
    computeOnly: boolean,
    camFit?: { distScale?: number; heightScale?: number; lookDownBias?: number },
    rollRate = 0,
    bank = 0
  ) {
    const C = CONFIG.camera;
    const baseFollow = C.chaseRollFollow ?? 0.14;
    const maxFollow = C.chaseRollFollowMax ?? 0.42;
    const resp = C.rollCamResponse ?? 6.5;

    // Dynamische Roll-Kopplung: bei A/D und Bank mehr Mitdrehen, im Geradeausflug weniger
    const rateNorm = THREE.MathUtils.clamp(Math.abs(rollRate) / (CONFIG.flight.rollRate * 1.1), 0, 1);
    const bankNorm = THREE.MathUtils.clamp(Math.abs(bank), 0, 1);
    const wantFollow =
      baseFollow +
      (maxFollow - baseFollow) * THREE.MathUtils.clamp(rateNorm * 0.75 + bankNorm * 0.45, 0, 1);
    const rfK = 1 - Math.exp(-resp * dt);
    this.rollFollowSmoothed += (wantFollow - this.rollFollowSmoothed) * rfK;
    this.bankSmoothed += (bank - this.bankSmoothed) * rfK;

    this.buildChaseBasis(jet, this.rollFollowSmoothed);

    const speedNorm = THREE.MathUtils.clamp(
      (speed - CONFIG.flight.cruiseSpeed) /
        (CONFIG.flight.afterburnerSpeed - CONFIG.flight.cruiseSpeed),
      0,
      1
    );

    const dScale = camFit?.distScale ?? 1;
    const hScale = camFit?.heightScale ?? 1;
    const lookBias = camFit?.lookDownBias ?? 0;

    // Distanz: Base × Jet-Fit + Speed Pull-Back − High-G/Airbrake Pull-In
    let dist = C.chaseOffset.z * dScale + speedNorm * (C.speedPullBack ?? 3.5);
    if (afterburner) dist += 0.8;
    if (airbrake) dist -= C.highGPullIn ?? 1.5;
    if (gForce > 4.5) dist -= (C.highGPullIn ?? 1.5) * THREE.MathUtils.clamp((gForce - 4.5) / 4, 0, 1);
    // Nah-Chase: nicht unter ~5 m, damit man den Jet noch sieht
    dist = Math.max(5, dist);

    // Bei starkem Rollen etwas weiter raus, damit der Jet im Frame bleibt
    dist += rateNorm * 0.55;

    const height = C.chaseOffset.y * hScale;
    const lookDist = C.chaseLookAhead ?? 180;
    const lookDown = (C.lookDownAngle ?? 0.12) + lookBias;

    // Seitlicher Versatz mit der Bank (Kamera „hängt“ leicht in der Rolle mit)
    const latAmt = (C.rollLateralOffset ?? 1.35) * this.bankSmoothed;

    this._desired
      .copy(jet.position)
      .addScaledVector(this._fwd, -dist)
      .addScaledVector(this._up, height)
      .addScaledVector(this._right, latAmt);

    // Position etwas knackiger, Bank/Up träger → realistischer Lag beim Rollen
    const kPos = 1 - Math.exp(-C.lerpPos * dt);
    const kRot = 1 - Math.exp(-(C.lerpRot ?? 6.5) * dt);
    if (!this.ready) {
      this.currentPos.copy(this._desired);
      this.currentFwd.copy(this._fwd);
      this.currentUp.copy(this._up);
      this.ready = true;
    } else {
      this.currentPos.lerp(this._desired, kPos);
      this.currentFwd.lerp(this._fwd, kRot).normalize();
      this.currentUp.lerp(this._up, kRot).normalize();
      this._right.crossVectors(this.currentUp, this.currentFwd).normalize();
      this.currentUp.crossVectors(this.currentFwd, this._right).normalize();
    }

    // Blick: parallel zur Nase + leichter Look-down
    // Bei Bank leicht in die Rollrichtung schauen (mit der Nase mitschwenken)
    this._look
      .copy(this.currentPos)
      .addScaledVector(this.currentFwd, lookDist)
      .addScaledVector(this.currentUp, -Math.sin(lookDown) * lookDist * 0.35)
      .addScaledVector(this._right, this.bankSmoothed * lookDist * 0.04);

    const wantTrack = trackTargetWorld ? 0.72 : 0;
    this.trackBlend += (wantTrack - this.trackBlend) * Math.min(1, dt * 3.5);
    if (this.trackBlend > 0.02 && trackTargetWorld) {
      this._look.lerp(trackTargetWorld, this.trackBlend);
    }

    if (!computeOnly) {
      camera.position.copy(this.currentPos);
      camera.up.copy(this.currentUp);
      camera.lookAt(this._look);
    } else {
      // Für Return-Slerp: Ziel-Quaternion vorbereiten
      camera.position.copy(this.currentPos);
      camera.up.copy(this.currentUp);
      camera.lookAt(this._look);
    }
  }

  private updateFreeLookState(held: boolean, camera: THREE.PerspectiveCamera) {
    const C = CONFIG.camera;
    if (held) {
      if (!this.freeLookActive) {
        this.freeLookActive = true;
        this.modeBeforeFree = this.mode === 'cockpit' ? 'cockpit' : 'chase';
        this.mode = 'free';
        this.freeYaw = 0;
        this.freePitch = 0.28;
        this.freeDist = C.freeLookDistance;
        this.ready = false;
      }
      this.freeReturnT = 1;
    } else if (this.freeLookActive) {
      // Start soft return
      this.freeLookActive = false;
      this.mode = this.modeBeforeFree;
      this.freeReturnFrom.copy(camera.position);
      this.freeReturnFromQuat.copy(camera.quaternion);
      this.freeReturnDur = C.freeLookReturnTime ?? 0.3;
      this.freeReturnT = 0;
      this.ready = true; // currentPos weiter glätten
    }
  }

  private updateFree(
    dt: number,
    jet: THREE.Object3D,
    camera: THREE.PerspectiveCamera,
    lookDelta?: { x: number; y: number }
  ) {
    const sens = CONFIG.camera.freeLookSensitivity;
    if (lookDelta) {
      this.freeYaw -= lookDelta.x * sens;
      this.freePitch += lookDelta.y * sens;
      this.freePitch = THREE.MathUtils.clamp(this.freePitch, -1.2, 1.35);
    }

    this.buildNoRollBasis(jet);
    const behind = this._fwd.clone().negate();
    const worldOff = new THREE.Vector3()
      .addScaledVector(behind, Math.cos(this.freeYaw) * Math.cos(this.freePitch) * this.freeDist)
      .addScaledVector(this._right, Math.sin(this.freeYaw) * Math.cos(this.freePitch) * this.freeDist)
      .addScaledVector(this._up, Math.sin(this.freePitch) * this.freeDist);

    const desired = jet.position.clone().add(worldOff);
    const k = 1 - Math.exp(-14 * dt);
    this.currentPos.lerp(desired, this.ready ? k : 1);
    this.ready = true;

    camera.position.copy(this.currentPos);
    camera.up.copy(this._up);
    camera.lookAt(jet.position.x, jet.position.y + 1.2, jet.position.z);
  }

  private applyShake(camera: THREE.PerspectiveCamera) {
    if (this.shakeAmp < 1e-5) return;
    const t = this.shakeTime;
    // Hochfrequenter Sine/Perlin-ähnlicher Shake
    this._shake.set(
      Math.sin(t * 47.3) * 0.6 + Math.sin(t * 23.1) * 0.4,
      Math.sin(t * 39.7 + 1.2) * 0.7 + Math.cos(t * 17.4) * 0.3,
      Math.sin(t * 31.2 + 0.7) * 0.5
    );
    camera.position.addScaledVector(this._shake, this.shakeAmp);
    camera.rotateZ(this._shake.x * this.shakeAmp * 0.15);
  }

  /** Toggle-Cockpit (V) */
  toggleCockpit() {
    if (this.freeLookActive || this.mode === 'free') {
      this.freeLookActive = false;
      this.mode = 'cockpit';
      this.ready = false;
      return;
    }
    this.mode = this.mode === 'chase' ? 'cockpit' : 'chase';
    this.ready = false;
  }

  /** Legacy toggle free-look (optional) */
  toggleFreeLook() {
    // map to hold-style: toggle freeLookActive
    if (this.freeLookActive) {
      this.freeLookActive = false;
      this.mode = this.modeBeforeFree;
      this.ready = false;
    } else {
      this.modeBeforeFree = this.mode === 'cockpit' ? 'cockpit' : 'chase';
      this.mode = 'free';
      this.freeLookActive = true;
      this.freeYaw = 0;
      this.freePitch = 0.28;
      this.freeDist = CONFIG.camera.freeLookDistance;
      this.ready = false;
    }
  }

  get isFreeLook() {
    return this.freeLookActive || this.mode === 'free';
  }

  get isTracking() {
    return this.trackBlend > 0.35;
  }

  snapBehind(jet: THREE.Object3D) {
    const off = CONFIG.camera.chaseOffset;
    const rollFollow = CONFIG.camera.chaseRollFollow ?? 0.17;
    this.buildChaseBasis(jet, this.mode === 'chase' ? rollFollow : 0);
    this.currentPos
      .copy(jet.position)
      .addScaledVector(this._fwd, -off.z)
      .addScaledVector(this._up, off.y);
    this.currentFwd.copy(this._fwd);
    this.currentUp.copy(this._up);
    this.ready = true;
    this.trackBlend = 0;
    this.freeLookActive = false;
    this.freeReturnT = 1;
    if (this.mode === 'free') {
      this.mode = 'chase';
      this.freeYaw = 0;
      this.freePitch = 0.28;
    }
  }
}

function smoothstep(t: number) {
  const x = THREE.MathUtils.clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}
