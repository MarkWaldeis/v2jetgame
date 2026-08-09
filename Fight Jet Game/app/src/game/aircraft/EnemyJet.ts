import * as THREE from 'three';
import { Aircraft } from './Aircraft';
import { CONFIG } from '../config';
import type { HeightField } from '../world/GlbMapTerrain';
import { getJetDef, jetFxVectors, type JetDef, type JetId } from './JetCatalog';

type AIState = 'patrol' | 'pursue' | 'attack' | 'evade' | 'orbit';

/**
 * KI-Gegner: immer in Bewegung, Bank-Kurven, kein Stillstand.
 * Langsam und eher schwach — fair für Singleplayer.
 */
export class EnemyJet extends Aircraft {
  readonly isPlayer = false;
  readonly jetId: JetId;
  readonly loadout: JetDef;
  state: AIState = 'patrol';
  cannonCooldown = 0;
  respawnTimer = 0;
  missileCooldown = 4 + Math.random() * 5;
  canFireMissiles = false;
  missilesRemaining = 0;

  private waypoint = new THREE.Vector3();
  private thinkTimer = Math.random() * 0.4;
  private evadeTimer = 0;
  private burstTimer = 0;
  private pendingMissile = false;
  private input = { pitch: 0, roll: 0, yaw: 0 };
  private catalogMuzzles: THREE.Vector3[];
  private readonly maxHp: number;
  wind = new THREE.Vector3();

  private waveSpeedScale = 1;
  /** Anti-Stuck */
  private lastPos = new THREE.Vector3();
  private stuckTime = 0;
  private patrolT = Math.random() * Math.PI * 2;
  private weavePhase = Math.random() * Math.PI * 2;
  private orbitCenter = new THREE.Vector3();
  private orbitRadius = 900;
  private orbitAngle = Math.random() * Math.PI * 2;
  private stateTime = 0;
  private readonly _to = new THREE.Vector3();
  private readonly _right = new THREE.Vector3();
  private readonly _up = new THREE.Vector3();
  private readonly _fwd = new THREE.Vector3();
  private readonly _desired = new THREE.Vector3();
  private readonly _local = new THREE.Vector3();

  constructor(index: number, jetId: JetId = 'f16') {
    const def = getJetDef(jetId);
    // Schwächer als Spieler-Variante
    const hp = Math.round(def.stats.hp * 0.48);
    super(`BANDIT ${index + 1} · ${def.name}`, { bodyColor: 0x8a6a52, accentColor: 0xd8c23a }, hp, 'enemy');
    this.jetId = jetId;
    this.loadout = def;
    this.maxHp = hp;
    this.catalogMuzzles = jetFxVectors(def).muzzles;
    this.applySpeedTurnScales();
    this.applyFlightPhysics(def.physics, def.engineType);
    this.pickWaypoint(null);
  }

  /** Speed-Mult nie so niedrig, dass Stall/Stehen bleibt */
  private applySpeedTurnScales() {
    const E = CONFIG.enemy;
    // Floor 0.52 / Cap 0.78 → spürbar langsamer als Spieler, aber flugfähig
    const raw = this.loadout.stats.speedMult * (E.speedScale ?? 0.58) * this.waveSpeedScale;
    this.flight.speedMult = THREE.MathUtils.clamp(raw, 0.52, 0.78);
    // Wendigkeit: unterlegen, aber genug für Kurven
    this.flight.turnMult = this.loadout.stats.turnMult * 0.62;
  }

  applyWaveModifiers(opts: { speedScale?: number; enemyMissiles?: boolean }) {
    this.waveSpeedScale = opts.speedScale ?? 1;
    this.applySpeedTurnScales();
    if (opts.enemyMissiles === false) {
      this.clearMissileLoadout();
    }
  }

  getMuzzles(): THREE.Vector3[] {
    if (this.anchors?.muzzles?.length) return this.anchors.muzzles.map((v) => v.clone());
    return this.catalogMuzzles.map((v) => v.clone());
  }

  get maxHpPublic(): number {
    return this.maxHp;
  }

  get cannonRPM(): number {
    // Langsamere Feuerrate als Katalog → schwächer
    return Math.round(this.loadout.stats.cannonRPM * 0.55);
  }

  spawn(awayFrom: THREE.Vector3) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 2200 + Math.random() * 2800;
    this.position.set(
      THREE.MathUtils.clamp(awayFrom.x + Math.cos(angle) * dist, -9000, 9000),
      650 + Math.random() * 700,
      THREE.MathUtils.clamp(awayFrom.z + Math.sin(angle) * dist, -9000, 9000)
    );
    // Leicht Richtung Spieler / Zufall ausrichten
    const yaw = angle + Math.PI + (Math.random() - 0.5) * 0.8;
    this.object.quaternion.setFromEuler(new THREE.Euler(0, yaw, 0, 'YXZ'));
    this.applySpeedTurnScales();
    // Immer über Stall-Speed starten
    const cruise = CONFIG.flight.cruiseSpeed * this.flight.speedMult;
    this.flight.speed = Math.max(72, cruise * (0.85 + Math.random() * 0.15));
    this.flight.snapVelocityToNose();
    this.hp = this.maxHp;
    this.alive = true;
    this.state = Math.random() < 0.45 ? 'orbit' : 'patrol';
    this.stateTime = 0;
    this.stuckTime = 0;
    this.lastPos.copy(this.position);
    this.orbitCenter.copy(this.position);
    this.orbitCenter.y = this.position.y;
    this.orbitRadius = 700 + Math.random() * 900;
    this.orbitAngle = Math.random() * Math.PI * 2;
    this.pickWaypoint(awayFrom);
    this.flutter.reset();
  }

  private pickWaypoint(near: THREE.Vector3 | null) {
    const cx = near?.x ?? this.position.x;
    const cz = near?.z ?? this.position.z;
    const r = 1200 + Math.random() * 2800;
    const a = Math.random() * Math.PI * 2;
    this.waypoint.set(
      THREE.MathUtils.clamp(cx + Math.cos(a) * r, -10000, 10000),
      THREE.MathUtils.clamp(450 + Math.random() * 1100, 400, 2200),
      THREE.MathUtils.clamp(cz + Math.sin(a) * r, -10000, 10000)
    );
  }

  wantsToFire(): boolean {
    return this.burstTimer > 0;
  }

  wantsMissileFire(): boolean {
    if (!this.pendingMissile) return false;
    this.pendingMissile = false;
    if (!this.canFireMissiles || this.missilesRemaining <= 0) return false;
    this.missilesRemaining -= 1;
    return true;
  }

  private canLaunchMissile(): boolean {
    return (
      this.canFireMissiles &&
      this.missilesRemaining > 0 &&
      this.missileCooldown <= 0
    );
  }

  assignWaveMissileLoadout(shots: number) {
    this.canFireMissiles = shots > 0;
    this.missilesRemaining = Math.max(0, shots);
    this.missileCooldown = 7 + Math.random() * 5;
    this.pendingMissile = false;
  }

  clearMissileLoadout() {
    this.canFireMissiles = false;
    this.missilesRemaining = 0;
    this.pendingMissile = false;
  }

  update(dt: number, player: Aircraft, terrain: HeightField) {
    if (!this.alive) return;
    const E = CONFIG.enemy;
    this.thinkTimer -= dt;
    this.cannonCooldown -= dt;
    this.burstTimer -= dt;
    this.missileCooldown = Math.max(0, this.missileCooldown - dt);
    this.stateTime += dt;
    this.patrolT += dt;
    this.weavePhase += dt * 1.4;

    // --- Anti-Stuck: Bewegung messen ---
    const moved = this.position.distanceTo(this.lastPos);
    const expected = Math.max(40, this.flight.speed) * dt * 0.35;
    if (moved < expected && this.flight.speed < 90) {
      this.stuckTime += dt;
    } else {
      this.stuckTime = Math.max(0, this.stuckTime - dt * 0.5);
    }
    this.lastPos.copy(this.position);

    if (this.stuckTime > 1.2 || this.flight.speed < 48) {
      this.unstick(terrain);
    }

    // --- KI-Denken ---
    if (this.thinkTimer <= 0) {
      this.thinkTimer = (E.thinkInterval ?? 0.28) * (0.85 + Math.random() * 0.3);
      this.think(player, E);
    }

    // --- Zielpunkt + Steuern ---
    const aimPoint = this.computeAimPoint(player, dt);
    this.steerTowards(aimPoint, dt, terrain);

    // Immer Gas — nie stehend
    let throttle = 0.72;
    if (this.state === 'patrol' || this.state === 'orbit') throttle = 0.68 + Math.sin(this.patrolT * 0.7) * 0.08;
    if (this.state === 'pursue') throttle = 0.82;
    if (this.state === 'attack') throttle = 0.78;
    if (this.state === 'evade') throttle = 0.9;
    if (this.flight.speed < 75) throttle = 1;
    this.flight.throttle = throttle;

    const wantAb =
      this.loadout.physics.hasAfterburner &&
      (this.state === 'evade' || (this.state === 'pursue' && this.flight.speed < 95));

    this.flight.update(dt, this.input, wantAb, { wind: this.wind });

    // Harte Mindestgeschwindigkeit (Arcade-KI, kein Stall-Stehen)
    const minFly = 68 * Math.sqrt(this.flight.speedMult);
    if (this.flight.speed < minFly) {
      this.flight.speed = THREE.MathUtils.lerp(this.flight.speed, minFly + 8, Math.min(1, dt * 2.5));
      if (this.flight.stalled) {
        this.flight.snapVelocityToNose();
      }
    }

    if (this.engineType === 'jet') {
      this.updateEngineFx(dt, this.flight.throttle, wantAb);
    } else {
      this.updateEngineFx(dt, 0, false);
    }
    const cruise = CONFIG.flight.cruiseSpeed * this.flight.speedMult;
    const maxSpd = CONFIG.flight.maxSpeed * this.flight.speedMult;
    this.updateLegacyFx(dt, this.flight.throttle, this.wind.length(), cruise, maxSpd);
    this.contrails.update(dt, this.flight.speed, this.flight.gForce);

    // Terrain / Decke
    const ground = Math.max(CONFIG.world.seaLevel, terrain.getHeight(this.position.x, this.position.z));
    if (this.position.y < ground + 100) {
      this.position.y = ground + 100;
      this.input.pitch = 1;
      this.flight.speed = Math.max(this.flight.speed, minFly);
    }
    if (this.position.y > 5500) this.position.y = 5500;

    // Weltgrenze: zurückdrehen
    const half = 11000;
    if (Math.abs(this.position.x) > half || Math.abs(this.position.z) > half) {
      this.waypoint.set(
        THREE.MathUtils.clamp(this.position.x * 0.3, -5000, 5000),
        this.position.y,
        THREE.MathUtils.clamp(this.position.z * 0.3, -5000, 5000)
      );
      this.state = 'patrol';
    }
  }

  private unstick(terrain: HeightField) {
    this.stuckTime = 0;
    const ground = Math.max(CONFIG.world.seaLevel, terrain.getHeight(this.position.x, this.position.z));
    if (this.position.y < ground + 250) this.position.y = ground + 280;
    // Nase leicht hoch, Speed pushen, neuen Kurs
    const pitchUp = THREE.MathUtils.degToRad(8);
    const eul = new THREE.Euler().setFromQuaternion(this.object.quaternion, 'YXZ');
    eul.x = THREE.MathUtils.clamp(eul.x + pitchUp, -0.4, 0.35);
    eul.z *= 0.4;
    this.object.quaternion.setFromEuler(eul);
    this.flight.speed = Math.max(this.flight.speed, 85);
    this.flight.snapVelocityToNose();
    this.pickWaypoint(this.position);
    this.state = 'patrol';
    this.stateTime = 0;
    this.orbitCenter.copy(this.position);
  }

  private think(player: Aircraft, E: typeof CONFIG.enemy) {
    const distToPlayer = player.alive ? this.position.distanceTo(player.position) : Infinity;
    const mRange = E.missileRange ?? 1800;
    const mMin = E.missileMinRange ?? 450;
    const mCone = E.missileConeDeg ?? 22;

    switch (this.state) {
      case 'patrol':
      case 'orbit':
        if (player.alive && distToPlayer < 2400) {
          this.state = 'pursue';
          this.stateTime = 0;
        } else if (this.state === 'patrol' && this.stateTime > 6 + Math.random() * 4) {
          this.state = 'orbit';
          this.orbitCenter.copy(this.position);
          this.orbitRadius = 600 + Math.random() * 1000;
          this.stateTime = 0;
        } else if (this.state === 'orbit' && this.stateTime > 8 + Math.random() * 5) {
          this.state = 'patrol';
          this.pickWaypoint(this.position);
          this.stateTime = 0;
        }
        if (this.position.distanceTo(this.waypoint) < 350) this.pickWaypoint(this.position);
        break;

      case 'pursue':
        if (distToPlayer < 1000 && this.isTargetInFront(player, 28)) {
          this.state = 'attack';
          this.stateTime = 0;
        }
        if (distToPlayer > 4200) {
          this.state = Math.random() < 0.5 ? 'orbit' : 'patrol';
          this.orbitCenter.copy(this.position);
          this.pickWaypoint(this.position);
          this.stateTime = 0;
        }
        // Selten Rakete, lange Pause
        if (
          player.alive &&
          this.canLaunchMissile() &&
          distToPlayer < mRange &&
          distToPlayer > mMin &&
          this.isTargetInFront(player, mCone) &&
          Math.random() < 0.35
        ) {
          this.pendingMissile = true;
          this.missileCooldown = (E.missileCooldown ?? 16) * (0.9 + Math.random() * 0.4);
        }
        if (Math.random() < (E.skillEvasionChance ?? 0.2) * 0.08) this.startEvade();
        break;

      case 'attack':
        if (distToPlayer > 1500) {
          this.state = 'pursue';
          this.stateTime = 0;
        }
        // Selten und kurze Bursts, enger Kegel
        if (
          this.isTargetInFront(player, (E.fireConeDeg ?? 7) * 0.85) &&
          distToPlayer < (E.fireRange ?? 650) &&
          this.cannonCooldown <= 0 &&
          Math.random() < 0.55
        ) {
          this.burstTimer = (E.burstLength ?? 0.35) * (0.6 + Math.random() * 0.4);
          this.cannonCooldown = 1.6 + Math.random() * 1.2;
        }
        if (
          player.alive &&
          this.canLaunchMissile() &&
          distToPlayer < mRange &&
          distToPlayer > mMin &&
          this.isTargetInFront(player, mCone + 4) &&
          Math.random() < 0.28
        ) {
          this.pendingMissile = true;
          this.missileCooldown = (E.missileCooldown ?? 16) * (0.85 + Math.random() * 0.5);
        }
        // Nach ein paar Sekunden Attack abbrechen → nicht kleben
        if (this.stateTime > 4.5 + Math.random() * 2) {
          this.state = Math.random() < 0.4 ? 'evade' : 'pursue';
          this.stateTime = 0;
          if (this.state === 'evade') this.evadeTimer = 1.2 + Math.random();
        }
        if (Math.random() < (E.skillEvasionChance ?? 0.2) * 0.05) this.startEvade();
        break;

      case 'evade':
        this.evadeTimer -= this.thinkTimer > 0 ? 0 : (E.thinkInterval ?? 0.28);
        // evadeTimer wird unten in startEvade gesetzt; hier über stateTime
        if (this.stateTime > this.evadeTimer) {
          this.state = 'pursue';
          this.stateTime = 0;
        }
        break;
    }
  }

  private computeAimPoint(player: Aircraft, dt: number): THREE.Vector3 {
    this.orbitAngle += dt * (0.35 + Math.random() * 0.05);

    switch (this.state) {
      case 'patrol': {
        // Waypoint + leichtes Weben
        const weave = Math.sin(this.weavePhase) * 180;
        this._desired.copy(this.waypoint);
        this._desired.x += weave;
        this._desired.y += Math.sin(this.weavePhase * 0.6) * 80;
        return this._desired;
      }
      case 'orbit': {
        this._desired.set(
          this.orbitCenter.x + Math.cos(this.orbitAngle) * this.orbitRadius,
          this.orbitCenter.y + Math.sin(this.orbitAngle * 0.7) * 120,
          this.orbitCenter.z + Math.sin(this.orbitAngle) * this.orbitRadius
        );
        return this._desired;
      }
      case 'pursue': {
        // Leichter Vorhalt, leicht seitlich versetzt (nicht starr auf Nase)
        const t = THREE.MathUtils.clamp(this.position.distanceTo(player.position) / 900, 0.4, 2.2);
        this._desired.copy(player.position).addScaledVector(player.forward, player.flight.speed * t * 0.45);
        this._desired.y += 40 + Math.sin(this.weavePhase) * 60;
        // Versatz: nicht immer frontal
        this._right.set(1, 0, 0).applyQuaternion(player.object.quaternion);
        this._desired.addScaledVector(this._right, Math.sin(this.patrolT * 0.5) * 220);
        return this._desired;
      }
      case 'attack': {
        const t = this.position.distanceTo(player.position) / 950;
        this._desired
          .copy(player.position)
          .addScaledVector(player.forward, player.flight.speed * t * 0.55);
        // Unpräzise: absichtlicher Offset
        this._desired.x += (Math.random() - 0.5) * 40;
        this._desired.y += (Math.random() - 0.5) * 30;
        return this._desired;
      }
      case 'evade':
      default: {
        this._to.copy(this.position).sub(player.position);
        if (this._to.lengthSq() < 1) this._to.set(1, 0.2, 0);
        this._to.normalize();
        this._desired.copy(this.position).addScaledVector(this._to, 1400);
        this._desired.y = this.position.y + 200 + Math.sin(this.weavePhase) * 300;
        return this._desired;
      }
    }
  }

  private startEvade() {
    this.state = 'evade';
    this.evadeTimer = 1.4 + Math.random() * 1.6;
    this.stateTime = 0;
  }

  private isTargetInFront(target: Aircraft, coneDeg: number): boolean {
    this._to.copy(target.position).sub(this.position).normalize();
    return this.forward.angleTo(this._to) < THREE.MathUtils.degToRad(coneDeg);
  }

  /**
   * Roll-to-Turn Richtung aimPoint — sichtbare Schräglage, kontinuierliche Bewegung.
   */
  private steerTowards(aimPoint: THREE.Vector3, _dt: number, terrain: HeightField) {
    this._fwd.set(0, 0, -1).applyQuaternion(this.object.quaternion).normalize();
    this._right.set(1, 0, 0).applyQuaternion(this.object.quaternion).normalize();
    this._up.set(0, 1, 0).applyQuaternion(this.object.quaternion).normalize();

    this._to.copy(aimPoint).sub(this.position);
    const dist = this._to.length();
    if (dist < 1) {
      this.input.pitch = 0.1;
      this.input.roll = 0;
      this.input.yaw = 0;
      return;
    }
    this._to.multiplyScalar(1 / dist);

    // In Body-Koordinaten (lokal)
    this._local.set(this._to.dot(this._right), this._to.dot(this._up), -this._to.dot(this._fwd));

    // Horizontaler Fehler → Bank (Roll-to-Turn)
    const yawErr = Math.atan2(this._local.x, Math.max(0.05, -this._local.z + 0.001));
    const pitchErr = Math.atan2(this._local.y, Math.sqrt(this._local.x * this._local.x + this._local.z * this._local.z) + 1e-4);
    const bank = THREE.MathUtils.clamp(-this._right.y, -1, 1);
    const desiredBank = THREE.MathUtils.clamp(yawErr * 1.65, -0.85, 0.85);

    // Roll zur gewünschten Schräglage
    let rollCmd = (desiredBank - bank) * 2.4;
    // Leichtes Weben im Patrol
    if (this.state === 'patrol' || this.state === 'orbit') {
      rollCmd += Math.sin(this.weavePhase * 0.9) * 0.22;
    }
    this.input.roll = THREE.MathUtils.clamp(rollCmd, -1, 1);

    // Pitch: Höhenfehler + Ziehen in die Kurve bei Bank
    let pitchCmd = THREE.MathUtils.clamp(pitchErr * 2.1, -0.85, 0.9);
    if (Math.abs(bank) > 0.2) {
      pitchCmd += Math.min(0.35, Math.abs(bank) * 0.3);
    }
    this.input.pitch = THREE.MathUtils.clamp(pitchCmd, -1, 1);

    // Yaw nur Feinkorrektur
    this.input.yaw = THREE.MathUtils.clamp(-yawErr * 0.35, -0.45, 0.45);

    // Mindesthöhe
    const ground = Math.max(CONFIG.world.seaLevel, terrain.getHeight(this.position.x, this.position.z));
    if (this.position.y < ground + 220) {
      this.input.pitch = Math.max(this.input.pitch, 0.65);
      this.input.roll *= 0.5;
    }
    // Decke
    if (this.position.y > 2800) {
      this.input.pitch = Math.min(this.input.pitch, -0.25);
    }
  }
}
