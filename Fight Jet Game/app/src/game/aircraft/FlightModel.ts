import * as THREE from 'three';
import { CONFIG } from '../config';
import type { FlightPhysicsProfile } from './JetCatalog';
import { MODERN_JET_PHYSICS } from './JetCatalog';

export type FlightInput = {
  pitch: number;
  roll: number;
  yaw: number;
};

export type FlightControlOpts = {
  /** Welt-Richtungsvektor zum Mouse-Aim-Punkt (unit). Null = reiner Stick. */
  aimDir?: THREE.Vector3 | null;
  /** Mouse-Aim / FBW aktiv */
  mouseAim?: boolean;
  /** 0..1 Blend nach Manual-Override (Smooth Recapture) */
  fbwBlend?: number;
  /** Airbrake aktiv */
  airbrake?: boolean;
  /** Aktueller Wind (Welt, m/s) — wirkt stärker auf anfällige Zellen */
  wind?: THREE.Vector3 | null;
};

/**
 * War Thunder–inspiriertes Arcade-Flugmodell:
 * - Nase (Heading) ≠ Velocity Vector (AoA / Sideslip)
 * - Roll-to-Turn FBW zum Mouse-Aim-Punkt
 * - Energy Bleed durch Induced Drag bei High-G
 * - Geschwindigkeitsabhängige Ruderwirkung + Stall
 * - Per-Aircraft Physik (Props: Torque, mehr Drag, kein AB)
 */
export class FlightModel {
  readonly object: THREE.Object3D;
  speed: number = CONFIG.flight.cruiseSpeed;
  throttle = 0.6;
  gForce = 1;
  stalled = false;
  /** Anstellwinkel (rad) zwischen Nase und Velocity */
  aoa = 0;
  /** Schiebewinkel (rad) */
  sideslip = 0;
  speedMult = 1;
  turnMult = 1;
  /** Per-Jet Physik (Drag, Torque, Stall, Wind) */
  physics: FlightPhysicsProfile = { ...MODERN_JET_PHYSICS };

  /** Tatsächliche Flugrichtung (unit, Welt) */
  readonly velocityDir = new THREE.Vector3(0, 0, -1);

  /**
   * Aktuelle Roll-Winkelgeschwindigkeit (rad/s, + = rechts einrollen).
   * Für Kamera-Mitnahme und Feel.
   */
  rollRateActual = 0;
  /** Bank ≈ −right.y (−1..1), + ≈ Rechtslage */
  bankSigned = 0;

  private qDelta = new THREE.Quaternion();
  private axis = new THREE.Vector3();
  private prevVel = new THREE.Vector3();
  private _fwd = new THREE.Vector3();
  private _right = new THREE.Vector3();
  private _up = new THREE.Vector3();
  private _localAim = new THREE.Vector3();
  private _tmp = new THREE.Vector3();
  private _tmp2 = new THREE.Vector3();
  private _wind = new THREE.Vector3();
  private _qInv = new THREE.Quaternion();

  /** Geglättete Ruder-Befehle (Smooth Recapture) */
  private cmdPitch = 0;
  private cmdRoll = 0;
  private cmdYaw = 0;
  /** Integrierte Roll-Rate (Trägheit) */
  private rollOmega = 0;
  /** Spin rate when fully stalled (trudeln) */
  private spinOmega = 0;

  constructor(object: THREE.Object3D) {
    this.object = object;
  }

  applyPhysics(profile: FlightPhysicsProfile) {
    this.physics = { ...profile };
  }

  get forward(): THREE.Vector3 {
    return new THREE.Vector3(0, 0, -1).applyQuaternion(this.object.quaternion);
  }

  /** Velocity als Vektor (Welt, m/s) */
  get velocity(): THREE.Vector3 {
    return this.velocityDir.clone().multiplyScalar(this.speed);
  }

  update(
    dt: number,
    input: FlightInput,
    afterburner: boolean,
    opts: FlightControlOpts = {}
  ) {
    const F = CONFIG.flight;
    const sm = this.speedMult;
    const tm = this.turnMult;
    const P = this.physics;
    const canAB = P.hasAfterburner && afterburner;

    // --- Basisvektoren ---
    this._fwd.set(0, 0, -1).applyQuaternion(this.object.quaternion).normalize();
    this._right.set(1, 0, 0).applyQuaternion(this.object.quaternion).normalize();
    this._up.set(0, 1, 0).applyQuaternion(this.object.quaternion).normalize();

    // --- Ruder-Befehle: Manual vs FBW ---
    let wantPitch = input.pitch;
    let wantRoll = input.roll;
    let wantYaw = input.yaw;

    const useFbw =
      !!opts.mouseAim &&
      !!opts.aimDir &&
      opts.aimDir.lengthSq() > 0.5 &&
      (opts.fbwBlend ?? 1) > 0.01;

    if (useFbw && opts.aimDir) {
      const fbw = this.computeFbwCommands(opts.aimDir);
      const b = THREE.MathUtils.clamp(opts.fbwBlend ?? 1, 0, 1);
      // Manual hat volle Priorität wenn Override; sonst FBW (Maus → Nase/Kanone)
      if (Math.abs(input.pitch) < 0.05 && Math.abs(input.roll) < 0.05 && Math.abs(input.yaw) < 0.05) {
        wantPitch = fbw.pitch;
        wantRoll = fbw.roll;
        wantYaw = fbw.yaw;
      } else {
        // Teil-Override: WASD gewinnt, aber leichte FBW-Mischung für Zielen
        wantPitch = input.pitch;
        wantRoll = input.roll;
        wantYaw = input.yaw;
      }
      // Snappigeres Folgen der Maus (Kanone dorthin, wo der Cursor zeigt)
      const recapture = 1 - Math.exp(-F.fbwRecaptureRate * dt);
      const smooth = Math.min(1, b * recapture + 0.65);
      this.cmdPitch += (wantPitch - this.cmdPitch) * smooth;
      this.cmdRoll += (wantRoll - this.cmdRoll) * Math.min(1, smooth * 0.85);
      this.cmdYaw += (wantYaw - this.cmdYaw) * smooth;
    } else {
      // Manual: snappy, aber mit leichter Filterung gegen Ruckler
      const k = 1 - Math.exp(-18 * dt);
      this.cmdPitch += (wantPitch - this.cmdPitch) * k;
      this.cmdRoll += (wantRoll - this.cmdRoll) * k;
      this.cmdYaw += (wantYaw - this.cmdYaw) * k;
    }

    // --- Agility (Speed + Stall) ---
    // Bei höherer Speed: Querruder greifen besser (Staudruck)
    const agility = THREE.MathUtils.clamp(
      (this.speed - 30) / (F.cruiseSpeed * sm - 30),
      0.12,
      1.2
    ) * tm;
    const rollAuthority = THREE.MathUtils.clamp(
      0.35 + (this.speed / (F.cruiseSpeed * sm)) * 0.75,
      0.3,
      1.15
    ) * tm;

    let pitchRate = this.cmdPitch * F.pitchRate * agility;
    let yawRate = this.cmdYaw * F.yawRate * agility;

    // Bank messen (+ = Rechtslage)
    const bank = THREE.MathUtils.clamp(-this._right.y, -1, 1);
    this.bankSigned = bank;

    // --- Realistisches Rollen: Winkelbeschleunigung + Trägheit ---
    // Ältere Zellen: etwas trägerer Roll-Anlauf
    const rollInertia = 1 + (P.dragMult - 1) * 0.35;
    const targetRollOmega = this.cmdRoll * F.rollRate * rollAuthority;
    const rollAccel = (F.rollAccel ?? 9.5) / rollInertia;
    const rollDamp = F.rollDamping ?? 4.2;

    if (Math.abs(this.cmdRoll) > 0.06) {
      // Mit Eingabe: beschleunigen Richtung Zielrate
      const err = targetRollOmega - this.rollOmega;
      this.rollOmega += err * Math.min(1, rollAccel * dt);
    } else {
      // Ohne A/D: weiches Auslaufen der Roll-Rate
      this.rollOmega *= Math.exp(-rollDamp * dt);
      // Sanftes Auto-Level nur wenn kaum noch Roll-Schwung und kein FBW
      if (!useFbw && Math.abs(this.rollOmega) < 0.35) {
        this.rollOmega += -bank * (F.autoLevelRate ?? 1.2) * agility * 0.55 * dt;
      }
    }

    // --- Propeller-Torque & P-Faktor (Vollgas zieht zur Seite) ---
    // Wichtig: als begrenzte Raten-Bias, NICHT als Dauer-Beschleunigung —
    // sonst trimmt sich die Zelle auf eine permanente Schräglage (Bank).
    if (P.torqueRoll !== 0 || P.pFactorYaw !== 0) {
      const thr = this.throttle;
      const lowSpeed = THREE.MathUtils.clamp(
        1.15 - this.speed / (F.cruiseSpeed * sm),
        0.35,
        1.2
      );
      const tPow = thr * thr * lowSpeed;
      // Sanfte Roll-Tendenz: mischt in Omega, ohne zu integrieren
      const torqueBias = P.torqueRoll * tPow * 0.55;
      this.rollOmega += (torqueBias - this.rollOmega * 0.08) * Math.min(1, dt * 2.5) * 0.35;
      yawRate += P.pFactorYaw * tPow * 0.65;
    }

    // --- Wind & Böen: drehen / schieben die Zelle realistischer ---
    // windSusceptibility skaliert (Props stärker, moderne Jets spürbar aber spielbar)
    if (opts.wind && opts.wind.lengthSq() > 0.01) {
      this._wind.copy(opts.wind);
      const sus = Math.max(0.2, P.windSusceptibility);
      const wLen = this._wind.length();
      const side = this._wind.dot(this._right); // Seitenwind
      const upW = this._wind.dot(this._up); // Auf-/Abwind
      const head = -this._wind.dot(this._fwd); // Gegenwind (+)

      // 1) Seitenwind: rollt die Tragfläche an + leichte Gier
      this.rollOmega += side * 0.028 * sus * dt * 10;
      yawRate += side * 0.012 * sus;

      // 2) Aufwind / Fallböe: Nase hoch/runter
      pitchRate += upW * 0.014 * sus;

      // 3) Weathercocking: Nase will in den Wind (realistisch bei Seitenwind)
      //    Gegenwind von schräg vorne → leichte Gier in den Wind
      const weathervane = side * (0.55 + Math.max(0, head) * 0.04);
      yawRate += weathervane * 0.008 * sus;

      // 4) Turbulenz-Jitter proportional zur Windstärke (Böen)
      const turb = THREE.MathUtils.clamp(wLen / 14, 0, 1.4) * sus;
      const t = performance.now() * 0.001;
      this.rollOmega += Math.sin(t * 7.3 + side) * 0.35 * turb * dt * 6;
      pitchRate += Math.sin(t * 5.1 + upW) * 0.22 * turb;
      yawRate += Math.cos(t * 6.2 + head) * 0.18 * turb;
    }

    // Stall: Nase fällt, Ruder weich, ggf. Trudeln
    const stallThreshold = F.minSpeed * P.stallSpeedMult * Math.max(0.75, Math.sqrt(sm));
    this.stalled = this.speed < stallThreshold;
    if (this.stalled) {
      const stallFactor = 1 - this.speed / Math.max(1, stallThreshold);
      pitchRate -= F.stallPitchDrop * P.stallDropMult * stallFactor;
      pitchRate *= 0.45;
      this.rollOmega *= 0.45;
      yawRate *= 0.35;
      // Trudeln: wachsende Spin-Rate
      const spinTarget = (Math.sign(this.rollOmega) || 1) * stallFactor * 1.8 * P.stallDropMult;
      this.spinOmega += (spinTarget - this.spinOmega) * Math.min(1, dt * 1.5);
      this.rollOmega += this.spinOmega * dt * 4;
      yawRate += this.spinOmega * 0.35;
    } else {
      this.spinOmega *= Math.exp(-3 * dt);
    }

    // Clamp max roll rate
    const maxOmega = F.rollRate * 1.25 * rollAuthority;
    this.rollOmega = THREE.MathUtils.clamp(this.rollOmega, -maxOmega * 1.35, maxOmega * 1.35);
    this.rollRateActual = this.rollOmega;

    // --- Rotation (lokale Achsen) ---
    // A/D = reines Rollen um die Längsachse (Trägheit über rollOmega)
    this.rotateLocal(new THREE.Vector3(1, 0, 0), pitchRate * dt);
    this.rotateLocal(new THREE.Vector3(0, 1, 0), yawRate * dt);
    this.rotateLocal(new THREE.Vector3(0, 0, 1), -this.rollOmega * dt);

    // Leichte Bank-Stabilisierung nur im Stillstand der Eingaben
    const stickMag = Math.abs(this.cmdPitch) + Math.abs(this.cmdRoll) + Math.abs(this.cmdYaw);
    if (stickMag < 0.05 && Math.abs(this.rollOmega) < 0.15 && !this.stalled && !useFbw) {
      this._right.set(1, 0, 0).applyQuaternion(this.object.quaternion);
      const b2 = THREE.MathUtils.clamp(-this._right.y, -1, 1);
      this.rotateLocal(new THREE.Vector3(0, 0, 1), b2 * F.angularDamping * 0.12 * dt);
    }

    // Forward nach Rotation aktualisieren
    this._fwd.set(0, 0, -1).applyQuaternion(this.object.quaternion).normalize();

    // --- Velocity Vector folgt Nase mit Verzögerung (AoA) ---
    // Props / Early Jets: trägeres Velocity-Align (höherer AoA)
    const pull = Math.abs(this.cmdPitch);
    const alignBase = F.velocityAlignRate * (0.55 + agility * 0.55) / (0.75 + P.inducedDragMult * 0.25);
    // High-G / Pull → Velocity hinkt hinterher (Nase schert ein)
    const align = alignBase / (1 + pull * 1.4 + (this.stalled ? 1.5 : 0));
    const aK = 1 - Math.exp(-align * dt);
    this.velocityDir.lerp(this._fwd, aK).normalize();

    // AoA / Sideslip messen
    this._right.set(1, 0, 0).applyQuaternion(this.object.quaternion).normalize();
    this._up.set(0, 1, 0).applyQuaternion(this.object.quaternion).normalize();
    // pitch AoA: angle in forward-up plane
    const velOnPitch = this._tmp.copy(this.velocityDir).addScaledVector(this._right, -this.velocityDir.dot(this._right));
    if (velOnPitch.lengthSq() > 1e-8) {
      velOnPitch.normalize();
      this.aoa = Math.atan2(velOnPitch.dot(this._up), velOnPitch.dot(this._fwd));
    } else {
      this.aoa = 0;
    }
    this.sideslip = Math.asin(
      THREE.MathUtils.clamp(this.velocityDir.dot(this._right), -1, 1)
    );

    // --- Energie / Drag ---
    const targetMax = (canAB ? F.afterburnerSpeed : F.maxSpeed) * sm;
    let accel =
      (canAB ? F.afterburnerAccel : F.thrustAccel) * this.throttle * sm * P.thrustMult;
    // WEP ohne echten AB: leichte Notleistung (~8 %) bei Props/Early Jets wenn Tab
    if (!P.hasAfterburner && afterburner) {
      accel *= 1.08;
    }
    if (opts.airbrake) accel -= 55;

    // Parasite drag
    let drag =
      F.dragBase * P.dragMult * this.speed * (this.speed / Math.max(40, F.maxSpeed * sm));

    // Induced drag ~ G² und AoA (Energy Bleed in Kurven) — steiler bei alten Zellen
    const loadApprox = 1 + Math.abs(this.cmdPitch) * 5.5 * (this.speed / Math.max(40, F.cruiseSpeed * sm));
    drag +=
      F.inducedDrag *
      P.inducedDragMult *
      Math.max(0, loadApprox - 1) *
      this.speed *
      0.35;
    drag += F.aoaDrag * P.inducedDragMult * Math.abs(this.aoa) * this.speed;

    // Steigen bremst, Sinken beschleunigt (entlang Velocity)
    const climbEffect = -this.velocityDir.y * 22;
    this.speed += (accel - drag + climbEffect) * dt;

    // Wind: Geschwindigkeit + Drift (Gegenwind bremst, Seitenwind schiebt)
    if (opts.wind && opts.wind.lengthSq() > 0.01) {
      const sus = Math.max(0.2, P.windSusceptibility);
      const head = -opts.wind.dot(this.velocityDir);
      this.speed += head * 0.14 * sus * dt;
      // Seitliche / vertikale Versetzung (Drift)
      this.object.position.addScaledVector(opts.wind, dt * 0.22 * sus);
      // Velocity-Dir leicht vom Wind mitgenommen (mehr „weht ab“)
      this.velocityDir.addScaledVector(opts.wind, dt * 0.006 * sus).normalize();
    }

    const minSpd = opts.airbrake ? 28 : Math.max(22, 30 * (0.85 + P.stallSpeedMult * 0.1));
    this.speed = THREE.MathUtils.clamp(
      this.speed,
      minSpd,
      targetMax * (opts.airbrake ? 0.92 : 1)
    );

    // --- Position entlang Velocity Vector (nicht Nase!) ---
    const vel = this._tmp2.copy(this.velocityDir).multiplyScalar(this.speed);
    const gravityFactor = THREE.MathUtils.clamp(
      1.3 - this.speed / Math.max(40, F.cruiseSpeed * sm),
      0,
      1.4
    );
    // Stall: stärkerer Höhenverlust
    const stallSink = this.stalled ? 1 + (1 - this.speed / Math.max(1, stallThreshold)) * 1.8 : 1;
    vel.y -= F.gravityPull * gravityFactor * stallSink * dt * 8;
    // Gravity zieht Velocity-Dir leicht nach unten bei niedriger Speed
    if (gravityFactor > 0.05) {
      this.velocityDir.y -= gravityFactor * 0.35 * stallSink * dt;
      this.velocityDir.normalize();
    }
    this.object.position.addScaledVector(vel, dt);

    // --- G-Force ---
    const dv = vel.clone().sub(this.prevVel).divideScalar(Math.max(dt, 1e-4)).length();
    const rawG = THREE.MathUtils.clamp(1 + dv / 19.6 + Math.abs(this.cmdPitch) * 4.2, 0.2, 12);
    this.gForce += (rawG - this.gForce) * Math.min(1, dt * 6);
    this.prevVel.copy(vel);
  }

  /**
   * Mouse-Aim FBW (Arcade / Gun-Follow-Mouse):
   * Die Nase (Kanone) folgt der Maus vor allem per Pitch + Yaw.
   * Rollen wird stark begrenzt, damit das Flugzeug nicht „durchdreht“,
   * sondern ruhig auf den Mauspunkt zielt.
   * aimDir = Welt-Unit-Vektor zum Virtual Aim Point.
   */
  private computeFbwCommands(aimDir: THREE.Vector3): FlightInput {
    const F = CONFIG.flight;
    this._qInv.copy(this.object.quaternion).invert();
    this._localAim.copy(aimDir).applyQuaternion(this._qInv);

    // Body: +X right, +Y up, -Z forward — Ziel vor uns: local.z < 0
    const lx = this._localAim.x;
    const ly = this._localAim.y;
    const lz = this._localAim.z;

    const horiz = Math.sqrt(lx * lx + lz * lz) + 1e-6;
    const pitchErr = Math.atan2(ly, horiz); // + = Ziel über Nase
    const yawErr = Math.atan2(lx, -lz); // + = Ziel rechts

    // Pitch: Nase zum Mauspunkt (stärker als zuvor)
    let pitchCmd = THREE.MathUtils.clamp(pitchErr * F.fbwPitchGain * 1.15, -1, 1);

    // Yaw: seitlich zum Mauspunkt — primäre „Richtung“ statt harter Roll
    // (Intern: +yaw = Nase nach links → Vorzeichen umkehren für Ziel rechts)
    let yawCmd = THREE.MathUtils.clamp(-yawErr * F.fbwYawGain * 2.4, -1, 1);

    // Nur leichte Bank als Hilfe, stark gekappt — verhindert Dauer-Spins
    const bank = THREE.MathUtils.clamp(-this._right.y, -1, 1);
    const softRoll = THREE.MathUtils.clamp(yawErr * F.fbwRollGain * 0.18, -0.35, 0.35);
    // Aktive Schräglage zurücknehmen (Auto-Level unter Mouse-Aim)
    let rollCmd = softRoll - bank * 0.55;
    rollCmd = THREE.MathUtils.clamp(rollCmd, -0.4, 0.4);

    // Totzone: fast auf dem Ziel → ruhig halten + Level
    if (Math.abs(pitchErr) < 0.025 && Math.abs(yawErr) < 0.025) {
      return {
        pitch: 0,
        roll: THREE.MathUtils.clamp(-bank * 0.7, -0.35, 0.35),
        yaw: 0,
      };
    }

    return {
      pitch: pitchCmd,
      roll: rollCmd,
      yaw: yawCmd,
    };
  }

  private rotateLocal(axis: THREE.Vector3, angle: number) {
    if (Math.abs(angle) < 1e-7) return;
    this.axis.copy(axis);
    this.qDelta.setFromAxisAngle(this.axis, angle);
    this.object.quaternion.multiply(this.qDelta).normalize();
  }

  /** Velocity-Dir an aktuelle Nase koppeln (Spawn/Reset) */
  snapVelocityToNose() {
    this.velocityDir.copy(this.forward);
    this.aoa = 0;
    this.sideslip = 0;
    this.cmdPitch = 0;
    this.cmdRoll = 0;
    this.cmdYaw = 0;
    this.rollOmega = 0;
    this.rollRateActual = 0;
    this.bankSigned = 0;
    this.spinOmega = 0;
    this.prevVel.copy(this.velocityDir).multiplyScalar(this.speed);
  }
}
