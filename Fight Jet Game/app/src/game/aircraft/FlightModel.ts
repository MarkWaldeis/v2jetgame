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
      // Roll snappy (sichtbare Schräglage), Pitch/Yaw etwas weicher
      const recapture = 1 - Math.exp(-F.fbwRecaptureRate * dt);
      const smooth = Math.min(1, b * recapture * 0.95 + 0.35);
      this.cmdPitch += (wantPitch - this.cmdPitch) * smooth;
      // Roll folgt Maus-Seite sofort → Jet neigt sich sichtbar
      this.cmdRoll += (wantRoll - this.cmdRoll) * Math.min(1, smooth * 1.35);
      this.cmdYaw += (wantYaw - this.cmdYaw) * Math.min(1, smooth * 0.55);
    } else {
      // Manual: knackig, aber gefiltert
      const k = 1 - Math.exp(-14 * dt);
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

    // --- Wind & Böen: sichtbares, realistisches „Wehen“ der Zelle ---
    if (opts.wind && opts.wind.lengthSq() > 0.01) {
      this._wind.copy(opts.wind);
      const sus = Math.max(0.28, P.windSusceptibility);
      const wLen = this._wind.length();
      const side = this._wind.dot(this._right);
      const upW = this._wind.dot(this._up);
      const head = -this._wind.dot(this._fwd);

      // 1) Seitenwind: Tragfläche kippt + leichte Gier
      this.rollOmega += side * 0.042 * sus * dt * 12;
      yawRate += side * 0.018 * sus;

      // 2) Aufwind / Fallböe: Nase nickt
      pitchRate += upW * 0.022 * sus;

      // 3) Weathercocking in den Wind
      const weathervane = side * (0.65 + Math.max(0, head) * 0.05);
      yawRate += weathervane * 0.012 * sus;

      // 4) Böen-Turbulenz (sichtbar, nicht unkontrollierbar)
      const turb = THREE.MathUtils.clamp(wLen / 12, 0, 1.55) * sus;
      const t = performance.now() * 0.001;
      this.rollOmega += Math.sin(t * 6.8 + side) * 0.48 * turb * dt * 7;
      pitchRate += Math.sin(t * 4.7 + upW) * 0.32 * turb;
      yawRate += Math.cos(t * 5.9 + head) * 0.26 * turb;
    }

    // --- Koordinierte Kurve / Bank-Turn (realistischer Look) ---
    // Schräglage allein dreht die Nase (Lift-Vektor); Ziehen verstärkt die Kurve.
    // So wirkt seitliches Fliegen geneigt statt „steif seitlich“.
    const bankForTurn = THREE.MathUtils.clamp(-this._right.y, -1, 1);
    if (Math.abs(bankForTurn) > 0.06 && !this.stalled) {
      const pull = Math.max(0, this.cmdPitch);
      const base = F.bankTurnBase ?? 0.72;
      const bankTurn =
        (F.bankTurnRate ?? 0) * bankForTurn * (base + pull * 0.95) * agility;
      yawRate += bankTurn;
      // Koordiniert: leichte Gier in die Bank
      yawRate += bankForTurn * (0.35 + Math.abs(this.cmdPitch)) * (F.coordTurnYaw ?? 0) * agility * 0.55;
      // Leichtes Ziehen in die Kurve (sichtbare „Load“ in der Schräglage)
      if (Math.abs(bankForTurn) > 0.18 && Math.abs(this.cmdPitch) < 0.15) {
        pitchRate += Math.min(0.22, Math.abs(bankForTurn) * 0.28) * agility;
      }
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

    // Steigen bremst, Sinken beschleunigt (Energie-Management)
    const climbY = this.velocityDir.y; // +1 = pure climb, -1 = pure dive
    const climbBrake = F.climbBrake ?? 36;
    const diveAccel = F.diveAccel ?? 40;
    let climbEffect = 0;
    if (climbY > 0.02) {
      // Steigen: spürbar langsamer (proportional zum Steigwinkel)
      climbEffect = -climbY * climbBrake;
    } else if (climbY < -0.02) {
      // Sinken: etwas schneller (nicht zu stark — fair)
      climbEffect = -climbY * diveAccel * 0.85;
    }
    this.speed += (accel - drag + climbEffect) * dt;

    // Wind: Geschwindigkeit + Drift
    if (opts.wind && opts.wind.lengthSq() > 0.01) {
      const sus = Math.max(0.28, P.windSusceptibility);
      const head = -opts.wind.dot(this.velocityDir);
      this.speed += head * 0.18 * sus * dt;
      this.object.position.addScaledVector(opts.wind, dt * 0.28 * sus);
      this.velocityDir.addScaledVector(opts.wind, dt * 0.008 * sus).normalize();
    }

    const minSpd = opts.airbrake ? 28 : Math.max(24, 32 * (0.85 + P.stallSpeedMult * 0.1));
    this.speed = THREE.MathUtils.clamp(
      this.speed,
      minSpd,
      targetMax * (opts.airbrake ? 0.92 : 1)
    );

    // --- Position entlang Velocity Vector (nicht Nase!) ---
    const vel = this._tmp2.copy(this.velocityDir).multiplyScalar(this.speed);
    const gravityFactor = THREE.MathUtils.clamp(
      1.35 - this.speed / Math.max(40, F.cruiseSpeed * sm),
      0,
      1.5
    );
    const stallSink = this.stalled ? 1 + (1 - this.speed / Math.max(1, stallThreshold)) * 1.8 : 1;
    // Extra: im Steigen zieht Gravity stärker an der Energy
    const climbG =
      climbY > 0.05 ? 1 + climbY * (F.climbGravityExtra ?? 0.55) : 1;
    vel.y -= F.gravityPull * gravityFactor * stallSink * climbG * dt * 8;
    if (gravityFactor > 0.05) {
      this.velocityDir.y -= gravityFactor * 0.42 * stallSink * climbG * dt;
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
   * Mouse-Aim FBW — realistisch (War-Thunder-Roll-to-Turn):
   * 1) Große Seitenfehler → erst einrollen (Bank)
   * 2) Pitch zieht in der Schräglage die Kurve
   * 3) Yaw nur Feinkorrektur / Seitenruder
   * aimDir = Welt-Unit-Vektor zum Virtual Aim Point (+ Soft-Assist).
   */
  private computeFbwCommands(aimDir: THREE.Vector3): FlightInput {
    const F = CONFIG.flight;
    this._qInv.copy(this.object.quaternion).invert();
    this._localAim.copy(aimDir).applyQuaternion(this._qInv);

    // Body: +X right, +Y up, -Z forward
    const lx = this._localAim.x;
    const ly = this._localAim.y;
    const lz = this._localAim.z;

    const horiz = Math.sqrt(lx * lx + lz * lz) + 1e-6;
    const pitchErr = Math.atan2(ly, horiz); // + = Ziel über Nase
    const yawErr = Math.atan2(lx, -lz); // + = Ziel rechts
    const bank = THREE.MathUtils.clamp(-this._right.y, -1, 1);

    const yawAbs = Math.abs(yawErr);
    const pitchAbs = Math.abs(pitchErr);

    // Totzone: auf dem Punkt → Bank abbauen, ruhig halten
    if (pitchAbs < 0.03 && yawAbs < 0.03) {
      return {
        pitch: THREE.MathUtils.clamp(pitchErr * F.fbwPitchGain * 0.4, -0.25, 0.25),
        roll: THREE.MathUtils.clamp(-bank * 0.85, -0.55, 0.55),
        yaw: 0,
      };
    }

    // Maus seitlich → starke gewünschte Schräglage (nicht flach gieren)
    const desiredBank = THREE.MathUtils.clamp(yawErr * 2.2, -0.98, 0.98);
    const bankErr = desiredBank - bank;

    const rollFirst = 1 - THREE.MathUtils.clamp(F.fbwRollPriority ?? 0.08, 0, 1);
    const sideWeight = THREE.MathUtils.smoothstep(yawAbs, 0.03, 0.4);

    // Primär: einrollen in die Maus-Richtung
    let rollCmd = bankErr * F.fbwRollGain * (0.75 + sideWeight * rollFirst);
    // Extra: direkter Roll-Befehl aus Seitenfehler (sofort spürbar)
    rollCmd += THREE.MathUtils.clamp(yawErr * 1.1 * sideWeight, -0.85, 0.85);
    rollCmd = THREE.MathUtils.clamp(rollCmd, -1, 1);

    // Pitch: Nase zum Ziel + Ziehen in die Kurve bei Bank
    let pitchCmd = THREE.MathUtils.clamp(pitchErr * F.fbwPitchGain, -1, 1);
    if (Math.abs(bank) > 0.12 && yawAbs > 0.03) {
      pitchCmd += Math.min(0.48, Math.abs(bank) * 0.42 + sideWeight * 0.18);
      pitchCmd = THREE.MathUtils.clamp(pitchCmd, -1, 1);
    }

    // Yaw: nur Restkorrektur — Kurve kommt aus Bank + bankTurnRate
    // Solange noch nicht genug Bank: Yaw drosseln (verhindert „steif seitlich“)
    const bankReady = THREE.MathUtils.smoothstep(Math.abs(bank), 0.12, 0.45);
    const yawWeight = (1 - sideWeight * 0.92 * rollFirst) * (0.25 + bankReady * 0.75);
    const yawCmd = THREE.MathUtils.clamp(-yawErr * F.fbwYawGain * yawWeight, -0.28, 0.28);

    // Fast aligned → Bank glätten
    if (yawAbs < 0.06) {
      rollCmd = THREE.MathUtils.clamp(rollCmd * 0.4 - bank * 0.5, -0.65, 0.65);
    }

    return { pitch: pitchCmd, roll: rollCmd, yaw: yawCmd };
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
