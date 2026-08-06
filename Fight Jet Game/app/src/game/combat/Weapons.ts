import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Damageable } from './GroundTarget';
import type { Effects } from './Effects';

// Ballistische Kanonen-Projektile (Tracer-Grafik + echte Flugzeit / Vorhalt).
const MAX_PROJECTILES = 200;
const TRACER_LEN = 9;

// Fallback-Mündungen am Bug (local -Z = Nase/Flugrichtung) — nur wenn der
// Schütze keine eigenen Mündungen aus dem Jet-Katalog mitbringt.
const MUZZLES_LOCAL = [
  new THREE.Vector3(-1.05, 0.0, -8.2), // links vorne
  new THREE.Vector3(1.05, 0.0, -8.2),  // rechts vorne
  new THREE.Vector3(-0.75, -0.12, -7.9),
  new THREE.Vector3(0.75, -0.12, -7.9),
];

const _zAxis = new THREE.Vector3(0, 0, 1);
const _muzzle = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _tmp = new THREE.Vector3();
const _tmp2 = new THREE.Vector3();
const _flashPos = new THREE.Vector3();
const _yAxis = new THREE.Vector3(0, 1, 0);
const _segA = new THREE.Vector3();
const _segB = new THREE.Vector3();
const _closest = new THREE.Vector3();

interface Projectile {
  alive: boolean;
  mesh: THREE.Mesh;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  damage: number;
  isPlayerShot: boolean;
  onHit: ((victim: Damageable, damage: number) => void) | null;
  effects: Effects | null;
}

/** Punkt–Strecke-Abstand (Welt) */
function distPointToSegment(point: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3): number {
  _tmp2.copy(b).sub(a);
  const lenSq = _tmp2.lengthSq();
  if (lenSq < 1e-8) return point.distanceTo(a);
  const t = THREE.MathUtils.clamp(_tmp.copy(point).sub(a).dot(_tmp2) / lenSq, 0, 1);
  _closest.copy(a).addScaledVector(_tmp2, t);
  return point.distanceTo(_closest);
}

function hitRadiusFor(target: Damageable, isPlayerShot: boolean): number {
  if (target.name.startsWith('SAM')) return 14;
  // Spieler trifft Luftziele: 4 m; Gegner trifft Spieler: 5 m
  if (target.isPlayer) return 5;
  return isPlayerShot ? 4 : 4;
}

export class CannonSystem {
  private projectiles: Projectile[] = [];
  private flashes: {
    mesh: THREE.Mesh;
    life: number;
  }[] = [];
  private group = new THREE.Group();
  private cursor = 0;
  private flashCursor = 0;
  private barrel = 0;

  constructor(scene: THREE.Scene) {
    // Box von z=0 (Heck/Mündung) bis z=+LEN (Spitze) — nur nach vorne, nie hinter die Mündung
    const geo = new THREE.BoxGeometry(0.07, 0.07, TRACER_LEN);
    geo.translate(0, 0, TRACER_LEN / 2);

    for (let i = 0; i < MAX_PROJECTILES; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffdd66,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const m = new THREE.Mesh(geo, mat);
      m.visible = false;
      m.frustumCulled = false;
      this.group.add(m);
      this.projectiles.push({
        alive: false,
        mesh: m,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 1,
        damage: 0,
        isPlayerShot: true,
        onHit: null,
        effects: null,
      });
    }

    const flashGeo = new THREE.SphereGeometry(0.28, 8, 6);
    for (let i = 0; i < 16; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffee88,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const m = new THREE.Mesh(flashGeo, mat);
      m.visible = false;
      this.group.add(m);
      this.flashes.push({ mesh: m, life: 0 });
    }

    scene.add(this.group);
  }

  /** Richtet lokale +Z des Tracers auf world-dir (Schussrichtung). */
  private orientAlong(dir: THREE.Vector3): THREE.Quaternion {
    if (Math.abs(dir.z + 1) < 1e-4 && Math.abs(dir.x) < 1e-4 && Math.abs(dir.y) < 1e-4) {
      _quat.setFromAxisAngle(_yAxis, Math.PI);
      return _quat;
    }
    if (Math.abs(dir.z - 1) < 1e-4 && Math.abs(dir.x) < 1e-4 && Math.abs(dir.y) < 1e-4) {
      _quat.identity();
      return _quat;
    }
    _quat.setFromUnitVectors(_zAxis, dir);
    return _quat;
  }

  private spawnFlash(worldPos: THREE.Vector3) {
    const f = this.flashes[this.flashCursor];
    this.flashCursor = (this.flashCursor + 1) % this.flashes.length;
    f.mesh.visible = true;
    f.mesh.position.copy(worldPos);
    f.mesh.scale.setScalar(0.5 + Math.random() * 0.6);
    (f.mesh.material as THREE.MeshBasicMaterial).opacity = 0.95;
    f.life = 0.035 + Math.random() * 0.025;
  }

  private spawnProjectile(
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    speed: number,
    life: number,
    damage: number,
    isPlayerShot: boolean,
    effects: Effects,
    onHit: (victim: Damageable, damage: number) => void
  ) {
    const p = this.projectiles[this.cursor];
    this.cursor = (this.cursor + 1) % MAX_PROJECTILES;
    p.alive = true;
    p.pos.copy(origin).addScaledVector(dir, 0.25);
    p.vel.copy(dir).multiplyScalar(speed);
    p.life = life;
    p.maxLife = life;
    p.damage = damage;
    p.isPlayerShot = isPlayerShot;
    p.onHit = onHit;
    p.effects = effects;
    p.mesh.visible = true;
    p.mesh.position.copy(p.pos);
    p.mesh.quaternion.copy(this.orientAlong(dir));
    (p.mesh.material as THREE.MeshBasicMaterial).opacity = 0.95;
  }

  /**
   * Salve aus Jet-Mündungen — reiner Vorhalt, kein Auto-Aim.
   * Schussrichtung = shooter.forward + Streuung. Treffer erst im update() per Ballistik.
   */
  fire(
    shooter: Damageable & {
      forward: import('three').Vector3;
      cannonDamage?: number;
      loadout?: { stats: { cannonSpread: number; cannonDamage: number } };
      getMuzzles?: () => import('three').Vector3[];
    },
    _target: Damageable | null,
    effects: Effects,
    onHit: (victim: Damageable, damage: number) => void
  ) {
    const q = shooter.object.quaternion;
    const pos = shooter.object.position;
    const spread = shooter.loadout?.stats.cannonSpread ?? CONFIG.player.cannonSpread;
    const baseDmg = shooter.isPlayer
      ? (shooter.cannonDamage ?? shooter.loadout?.stats.cannonDamage ?? CONFIG.player.cannonDamage)
      : (shooter.loadout?.stats.cannonDamage != null
          ? shooter.loadout.stats.cannonDamage * 0.35
          : CONFIG.enemy.cannonDamage);

    const muzzles = shooter.getMuzzles?.() ?? MUZZLES_LOCAL;
    const count = Math.max(1, muzzles.length);

    const dualChance =
      count > 1 && shooter.loadout?.stats.cannonDamage && shooter.loadout.stats.cannonDamage >= 7 ? 0.35 : 0.85;
    const dual = count > 1 && Math.random() < dualChance;
    const first = this.barrel % count;
    const indices = dual ? [first, (first + 1) % count] : [first];
    this.barrel++;

    const bulletSpeed = CONFIG.player.bulletSpeed;
    const range = shooter.isPlayer ? CONFIG.player.cannonRange : CONFIG.enemy.fireRange;
    const life = range / bulletSpeed;
    const dmg = dual ? baseDmg * 1.15 : baseDmg;

    for (const muzzleIdx of indices) {
      const local = muzzles[muzzleIdx];
      _muzzle.copy(local).applyQuaternion(q).add(pos);

      // Immer Nase / Forward + normale Streuung — kein Aim-Assist
      _dir.copy(shooter.forward);
      _dir.x += (Math.random() - 0.5) * spread;
      _dir.y += (Math.random() - 0.5) * spread;
      _dir.z += (Math.random() - 0.5) * spread;
      _dir.normalize();

      this.spawnFlash(_flashPos.copy(_muzzle).addScaledVector(_dir, 0.15));
      this.spawnProjectile(
        _muzzle,
        _dir,
        bulletSpeed + (Math.random() - 0.5) * 40,
        life,
        dmg,
        shooter.isPlayer,
        effects,
        onHit
      );
    }
  }

  /**
   * Ballistik-Update: Projektile bewegen, Segment-Kollision gegen Ziele.
   * @param targets alle potenziellen Treffer (Gegner, SAMs, Spieler)
   */
  update(dt: number, targets: Damageable[] = []) {
    const gravity = CONFIG.player.bulletGravity ?? 3;

    for (const p of this.projectiles) {
      if (!p.alive) continue;

      _segA.copy(p.pos);
      // Leichter Geschossabfall — Vorhalt bleibt dominant
      p.vel.y -= gravity * dt;
      p.pos.addScaledVector(p.vel, dt);
      _segB.copy(p.pos);

      p.life -= dt;
      if (p.life <= 0) {
        p.alive = false;
        p.mesh.visible = false;
        continue;
      }

      // Grafik
      p.mesh.position.copy(p.pos);
      if (p.vel.lengthSq() > 1e-6) {
        p.mesh.quaternion.copy(this.orientAlong(_tmp.copy(p.vel).normalize()));
      }
      const mat = p.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.95 * Math.max(0.15, p.life / p.maxLife);

      // Kollision: Strecke alt→neu gegen jedes Ziel
      for (const target of targets) {
        if (!target.alive) continue;
        // Eigene Kugeln treffen den Spieler nicht; Gegner-Kugeln nicht andere Banditen
        if (p.isPlayerShot && target.isPlayer) continue;
        if (!p.isPlayerShot && !target.isPlayer && !target.name.startsWith('SAM')) continue;

        const radius = hitRadiusFor(target, p.isPlayerShot);
        const d = distPointToSegment(target.object.position, _segA, _segB);
        if (d <= radius) {
          p.effects?.hitSparks(_closest);
          p.onHit?.(target, p.damage);
          p.alive = false;
          p.mesh.visible = false;
          break;
        }
      }
    }

    for (const f of this.flashes) {
      if (!f.mesh.visible) continue;
      f.life -= dt;
      if (f.life <= 0) {
        f.mesh.visible = false;
        continue;
      }
      f.mesh.scale.multiplyScalar(1 + dt * 8);
      (f.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, f.life / 0.05);
    }
  }
}

export type MissileProfileId = 'player' | 'enemy' | 'sam';

export type MissileLaunchOpts = {
  /** 3D-Modell der Rakete (optional) */
  visual?: THREE.Object3D | null;
  /** Geschwindigkeit des Trägerjets beim Abwurf (m/s) */
  carrierSpeed?: number;
  /** Lokaler „Drop“: Welt-Vektor nach unten/außen beim Launch */
  ejectWorld?: THREE.Vector3;
  /** Flugprofil — enemy/sam sind absichtlich langsamer (Flares möglich) */
  profile?: MissileProfileId;
};

type MissileTune = {
  speed: number;
  life: number;
  turnRate: number;
  damage: number;
  proximityRadius: number;
  lockLoseAngleDeg: number;
  boostTime: number;
  leadGain: number;
  startBoost: number;
};

function resolveMissileTune(profile: MissileProfileId): MissileTune {
  const base = CONFIG.missile;
  if (profile === 'enemy' && base.enemy) {
    return {
      speed: base.enemy.speed,
      life: base.enemy.life,
      turnRate: base.enemy.turnRate,
      damage: base.enemy.damage,
      proximityRadius: base.enemy.proximityRadius,
      lockLoseAngleDeg: base.enemy.lockLoseAngleDeg,
      boostTime: base.enemy.boostTime,
      leadGain: base.enemy.leadGain,
      startBoost: base.enemy.startBoost,
    };
  }
  if (profile === 'sam' && base.sam) {
    return {
      speed: base.sam.speed,
      life: base.sam.life,
      turnRate: base.sam.turnRate,
      damage: base.sam.damage,
      proximityRadius: base.sam.proximityRadius,
      lockLoseAngleDeg: base.sam.lockLoseAngleDeg,
      boostTime: base.sam.boostTime,
      leadGain: base.sam.leadGain,
      startBoost: base.sam.startBoost,
    };
  }
  return {
    speed: base.speed,
    life: base.life,
    turnRate: base.turnRate,
    damage: base.damage,
    proximityRadius: base.proximityRadius,
    lockLoseAngleDeg: base.lockLoseAngleDeg,
    boostTime: base.boostTime ?? 1.6,
    leadGain: base.leadGain ?? 0.55,
    startBoost: 40,
  };
}

// Lenkrakete: Start am Hardpoint, Drop, Boost, Pursuit mit Lead, 3D-Visual.
export class Missile {
  readonly object = new THREE.Group();
  alive = true;
  /** Für Radar / Threat-Display */
  readonly profile: MissileProfileId;
  readonly damage: number;
  private vel: THREE.Vector3;
  private life: number;
  private age = 0;
  private target: Damageable | null;
  private effects: Effects;
  private tune: MissileTune;
  private prevTargetPos = new THREE.Vector3();
  private targetVel = new THREE.Vector3();
  private hasPrevTarget = false;
  private _fwd = new THREE.Vector3(0, 0, -1);
  private _dir = new THREE.Vector3();
  private _to = new THREE.Vector3();
  private _axis = new THREE.Vector3();
  private _lead = new THREE.Vector3();
  private _tailLocal = new THREE.Vector3();
  private _tailWorld = new THREE.Vector3();
  private motorCore: THREE.Mesh;
  private motorOuter: THREE.Mesh;
  private motorDisc: THREE.Mesh;

  constructor(
    target: Damageable,
    start: THREE.Vector3,
    startDir: THREE.Vector3,
    _owner: Damageable,
    effects: Effects,
    opts: MissileLaunchOpts = {}
  ) {
    this.profile = opts.profile ?? 'player';
    this.tune = resolveMissileTune(this.profile);
    this.damage = this.tune.damage;
    this.target = target;
    this.effects = effects;
    this.object.position.copy(start);

    const dir = startDir.clone().normalize();
    const carrier = opts.carrierSpeed ?? CONFIG.flight.cruiseSpeed;
    // Start mit Jet-Geschwindigkeit + leichter Boost-Anteil
    const startSpd =
      this.profile === 'player'
        ? Math.max(80, carrier * 0.95 + this.tune.startBoost)
        : Math.max(60, carrier * 0.75 + this.tune.startBoost);
    this.vel = dir.multiplyScalar(startSpd);
    // Drop/Eject vom Pylon (seitlich/unten)
    if (opts.ejectWorld) {
      this.vel.add(opts.ejectWorld);
    }
    this.life = this.tune.life;

    let tailZ = 1.12;
    let exhaustRadius = 0.13;
    if (opts.visual) {
      const visualBox = new THREE.Box3().setFromObject(opts.visual);
      const visualSize = visualBox.getSize(new THREE.Vector3());
      tailZ = visualBox.max.z;
      exhaustRadius = THREE.MathUtils.clamp(Math.max(visualSize.x, visualSize.y) * 0.12, 0.09, 0.2);
      this.object.add(opts.visual);
    } else {
      // Fallback-Capsule
      const mat = new THREE.MeshStandardMaterial({ color: 0xd8d8d8, metalness: 0.45, roughness: 0.35 });
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 1.8, 4, 8), mat);
      body.rotation.x = Math.PI / 2;
      this.object.add(body);
    }

    // Nachbrenner-Flamme am Heck (+Z relativ zur −Z-Nase)
    this._tailLocal.set(0, 0, tailZ + 0.04);
    const motorMaterial = (color: number) =>
      new THREE.MeshBasicMaterial({
        color,
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      });
    const motorCone = (radius: number) => {
      const geometry = new THREE.ConeGeometry(radius, 1, 12, 1, true);
      geometry.rotateX(Math.PI / 2);
      geometry.translate(0, 0, 0.5);
      return geometry;
    };

    this.motorOuter = new THREE.Mesh(motorCone(exhaustRadius * 1.35), motorMaterial(0xff7a22));
    this.motorOuter.position.z = tailZ;
    this.motorOuter.name = 'missileMotorOuter';
    this.object.add(this.motorOuter);

    this.motorCore = new THREE.Mesh(motorCone(exhaustRadius * 0.72), motorMaterial(0xfff0bd));
    this.motorCore.position.z = tailZ;
    this.motorCore.name = 'missileMotorCore';
    this.object.add(this.motorCore);

    this.motorDisc = new THREE.Mesh(
      new THREE.CircleGeometry(exhaustRadius * 0.9, 16),
      motorMaterial(0xffdf9c)
    );
    this.motorDisc.position.z = tailZ + 0.015;
    this.motorDisc.name = 'missileMotorDisc';
    this.object.add(this.motorDisc);

    this.object.quaternion.setFromUnitVectors(this._fwd, this.vel.clone().normalize());
    if (target?.alive) {
      this.prevTargetPos.copy(target.object.position);
      this.hasPrevTarget = true;
    }
  }

  targetIs(t: Damageable): boolean {
    return this.target === t;
  }

  /** Aktuelles Ziel (für Flare-/Threat-Logik) */
  get guidedTarget(): Damageable | null {
    return this.target;
  }

  /**
   * Gegenmaßnahme: IR/Radar-Lock brechen (War-Thunder-Flares).
   * Rakete fliegt ballistisch weiter, ohne Pursuit.
   */
  decoy(): void {
    this.target = null;
    this.hasPrevTarget = false;
  }

  private updateMotorFx(boostTime: number) {
    const ignition = THREE.MathUtils.smoothstep(this.age, 0.1, 0.22);
    const burnout = 1 - THREE.MathUtils.smoothstep(this.age, boostTime + 0.15, boostTime + 0.6);
    const power = ignition * burnout;
    const flicker = 0.9 + Math.sin(this.age * 47) * 0.065 + Math.sin(this.age * 71) * 0.035;

    this.motorCore.visible = power > 0.015;
    this.motorOuter.visible = power > 0.015;
    this.motorDisc.visible = power > 0.015;
    this.motorCore.scale.set(1, 1, (1.15 + flicker * 0.45) * power);
    this.motorOuter.scale.set(1, 1, (2 + flicker * 0.75) * power);
    this.motorDisc.scale.setScalar(0.8 + power * 0.25);
    (this.motorCore.material as THREE.MeshBasicMaterial).opacity = power * 0.78;
    (this.motorOuter.material as THREE.MeshBasicMaterial).opacity = power * 0.34;
    (this.motorDisc.material as THREE.MeshBasicMaterial).opacity = power * 0.7;
    return power;
  }

  get position(): THREE.Vector3 {
    return this.object.position;
  }

  /** Eingehende Bedrohung gegen den Spieler (für Radar / Warnung) */
  isIncomingThreat(): boolean {
    return this.alive && this.target?.isPlayer === true;
  }

  update(dt: number): { hit: Damageable | null; expired: boolean } {
    const M = this.tune;
    this.life -= dt;
    this.age += dt;
    if (this.life <= 0 || !this.alive) {
      this.effects.explosion(this.object.position, false);
      return { hit: null, expired: true };
    }

    // Boost-Phase: stark beschleunigen, dann Cruise (enemy/sam langsamer)
    const boost = M.boostTime;
    const motorPower = this.updateMotorFx(boost);
    const boostAccel = this.profile === 'player' ? 520 : this.profile === 'enemy' ? 280 : 220;
    const cruiseAccel = this.profile === 'player' ? 180 : 110;
    const accel = this.age < 0.12 ? 0 : this.age < boost ? boostAccel : cruiseAccel;
    const maxSpd = this.age < boost ? M.speed * 0.92 : M.speed;
    this.vel.setLength(Math.min(maxSpd, this.vel.length() + accel * dt));

    // Leichte Schwerkraft in der ersten halben Sekunde (Drop-Kurve)
    if (this.age < 0.55) {
      this.vel.y -= 9.81 * 0.55 * dt;
    }

    if (this.target && this.target.alive) {
      // Zielgeschwindigkeit schätzen
      if (this.hasPrevTarget && dt > 1e-4) {
        this.targetVel
          .copy(this.target.object.position)
          .sub(this.prevTargetPos)
          .multiplyScalar(1 / dt);
      }
      this.prevTargetPos.copy(this.target.object.position);
      this.hasPrevTarget = true;

      const dist = this.object.position.distanceTo(this.target.object.position);
      // Lead pursuit: Vorhalt proportional zur Flugzeit-Schätzung
      const closing = Math.max(80, this.vel.length());
      const tHit = dist / closing;
      this._lead
        .copy(this.target.object.position)
        .addScaledVector(this.targetVel, tHit * M.leadGain);

      this._to.copy(this._lead).sub(this.object.position);
      if (this._to.lengthSq() > 1e-6) this._to.normalize();

      this._dir.copy(this.vel).normalize();
      const angle = this._dir.angleTo(this._to);

      // Nach Drop-Phase härter drehen; Feind-Raketen anfangs träger (Flares-Fenster)
      const turnMul =
        this.age < 0.45
          ? this.profile === 'player'
            ? 0.35
            : 0.22
          : this.age < boost
            ? this.profile === 'player'
              ? 0.85
              : 0.7
            : this.profile === 'player'
              ? 1.15
              : 0.95;
      if (angle > THREE.MathUtils.degToRad(M.lockLoseAngleDeg) && this.age > 1.2) {
        this.target = null;
      } else {
        const maxTurn = M.turnRate * turnMul * dt;
        const turn = Math.min(angle, maxTurn);
        this._axis.crossVectors(this._dir, this._to);
        if (this._axis.lengthSq() > 1e-8) {
          this._axis.normalize();
          this._dir.applyAxisAngle(this._axis, turn);
          this.vel.copy(this._dir.multiplyScalar(this.vel.length()));
        }
      }

      if (this.target && dist < M.proximityRadius) {
        this.effects.explosion(this.object.position, true);
        return { hit: this.target, expired: true };
      }
    }

    this.object.position.addScaledVector(this.vel, dt);
    if (this.vel.lengthSq() > 1e-6) {
      this.object.quaternion.setFromUnitVectors(
        this._fwd,
        this.vel.clone().normalize()
      );
    }

    // Smoke seltener bei hoher FPS
    if (motorPower > 0.08 && Math.random() < Math.min(1, dt * 45)) {
      this._tailWorld.copy(this._tailLocal).applyQuaternion(this.object.quaternion).add(this.object.position);
      this.effects.missileSmoke(this._tailWorld);
    }
    return { hit: null, expired: false };
  }
}
