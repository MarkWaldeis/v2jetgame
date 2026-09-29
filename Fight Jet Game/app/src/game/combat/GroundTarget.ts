import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Aircraft } from '../aircraft/Aircraft';

// Gemeinsames Ziel-Interface für Kanonen & Raketen (Jets + Bodenziele)
export interface Damageable {
  alive: boolean;
  isPlayer: boolean;
  object: THREE.Object3D;
  name: string;
  takeDamage(dmg: number): boolean;
}

/** Radar-/Marker-Typ für HUD */
export type GroundKind = 'sam' | 'aaa';

// ═══════════════════════════════════════════════════════════════════════════
// SAM-Site: Radar + Werfer — feuert Lenkwaffen
// ═══════════════════════════════════════════════════════════════════════════
export class SamSite implements Damageable {
  readonly object = new THREE.Group();
  readonly isPlayer = false;
  readonly name: string;
  readonly groundKind: GroundKind = 'sam';
  alive = true;
  hp = CONFIG.mission.samHp;
  /** Prozedurale Fallback-Visuals (werden durch GLB ersetzt, sobald geladen) */
  private visuals = new THREE.Group();
  private radarDish: THREE.Object3D;
  private fireTimer: number;
  private burnTimer = 0;
  /** Multiplikator auf Fire-Interval (>1 = langsamer) */
  private fireSlow: number;

  constructor(index: number, pos: THREE.Vector3, fireSlow = 1) {
    this.name = `SAM ${index + 1}`;
    this.fireSlow = Math.max(0.5, fireSlow);
    this.object.position.copy(pos);
    this.object.add(this.visuals);
    this.fireTimer = 3 + Math.random() * CONFIG.mission.samFireInterval * this.fireSlow;

    const concreteMat = new THREE.MeshStandardMaterial({ color: 0x8b8578, roughness: 0.9 });
    const armyMat = new THREE.MeshStandardMaterial({ color: 0x4a5238, roughness: 0.7, metalness: 0.3 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x2c2e30, roughness: 0.6, metalness: 0.4 });

    const base = new THREE.Mesh(new THREE.CylinderGeometry(6, 7, 2, 8), concreteMat);
    base.position.y = 1;
    this.visuals.add(base);

    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 5, 8), darkMat);
    mast.position.y = 4;
    this.visuals.add(mast);
    this.radarDish = new THREE.Mesh(
      new THREE.SphereGeometry(2.2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2.6),
      armyMat
    );
    this.radarDish.position.y = 7;
    this.radarDish.rotation.x = Math.PI / 3;
    this.visuals.add(this.radarDish);

    for (const side of [-1, 1]) {
      const launcher = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.2, 5), armyMat);
      launcher.position.set(side * 5.5, 1.8, 0);
      this.visuals.add(launcher);
      for (let i = 0; i < 4; i++) {
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 4.6, 8), darkMat);
        tube.rotation.x = -Math.PI / 4;
        tube.position.set(side * 5.5 - 0.7 + (i % 2) * 1.4, 2.8, -0.5 + Math.floor(i / 2) * 0.9);
        this.visuals.add(tube);
      }
    }

    const stripe = new THREE.Mesh(
      new THREE.CylinderGeometry(6.05, 6.05, 0.4, 8),
      new THREE.MeshStandardMaterial({ color: 0xc8a23a, roughness: 0.8 })
    );
    stripe.position.y = 1.8;
    this.visuals.add(stripe);
  }

  /**
   * GLB-Visual (models/ground-vehicles.glb → SAM_Site) gegen die
   * prozeduralen Platzhalter tauschen. 'SAM_Dish' wird zur Spin-Node.
   */
  attachGlb(model: THREE.Object3D): boolean {
    const dish = model.getObjectByName('SAM_Dish');
    if (!dish) return false;
    this.object.remove(this.visuals);
    this.object.add(model);
    this.radarDish = dish;
    return true;
  }

  get position(): THREE.Vector3 {
    return this.object.position;
  }

  takeDamage(dmg: number): boolean {
    if (!this.alive) return false;
    this.hp -= dmg;
    if (this.hp <= 0) {
      this.alive = false;
      this.object.rotation.z = 0.15;
      this.object.position.y -= 0.8;
      return true;
    }
    return false;
  }

  update(dt: number, player: Aircraft, onFire: (site: SamSite) => void) {
    if (!this.alive) {
      this.burnTimer += dt;
      return;
    }
    this.radarDish.rotation.y += dt * 1.2;
    if (!player.alive) return;
    const dist = this.position.distanceTo(player.position);
    this.fireTimer -= dt;
    if (this.fireTimer <= 0 && dist < CONFIG.mission.samRange) {
      this.fireTimer = CONFIG.mission.samFireInterval * this.fireSlow * (0.8 + Math.random() * 0.4);
      onFire(this);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// AAA Truck — Flak-Fahrzeug (Platzhalter-Modell, Kanone, KEINE Lenkwaffen)
// ═══════════════════════════════════════════════════════════════════════════
export class AaaTruck implements Damageable {
  readonly object = new THREE.Group();
  readonly isPlayer = false;
  readonly name: string;
  readonly groundKind: GroundKind = 'aaa';
  alive = true;
  hp: number;
  /** Prozedurale Fallback-Visuals (werden durch GLB ersetzt) */
  private visuals = new THREE.Group();
  /** Yaw-Node (prozedural oder GLB 'AAA_Turret') */
  private turret: THREE.Object3D;
  /** Pitch-Node für die Rohre (prozedural oder GLB 'AAA_Guns') */
  private gunsPivot: THREE.Object3D;
  private fireTimer: number;
  private burstLeft = 0;
  private burnTimer = 0;
  /** Temp-Vektor für Muzzle-Weltposition (kein Allok im Loop) */
  private _muzzle = new THREE.Vector3();
  /** Schaden pro Treffer (niedrig — Level 1 fair) */
  private dmg: number;
  private range: number;
  private fireInterval: number;

  constructor(index: number, pos: THREE.Vector3, opts?: { hp?: number; dmg?: number; range?: number }) {
    this.name = `AAA ${index + 1}`;
    this.hp = opts?.hp ?? CONFIG.mission.aaaHp ?? 28;
    this.dmg = opts?.dmg ?? CONFIG.mission.aaaDamage ?? 2.5;
    this.range = opts?.range ?? CONFIG.mission.aaaRange ?? 2200;
    this.fireInterval = CONFIG.mission.aaaFireInterval ?? 0.11;
    this.object.position.copy(pos);
    this.object.add(this.visuals);
    this.fireTimer = 1 + Math.random() * 2;

    const olive = new THREE.MeshStandardMaterial({ color: 0x3d4a32, roughness: 0.85, metalness: 0.25 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a2e28, roughness: 0.7, metalness: 0.35 });
    const rubber = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.95 });
    const accent = new THREE.MeshStandardMaterial({ color: 0x6b7a35, roughness: 0.6 });

    // Chassis
    const body = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.4, 7.5), olive);
    body.position.y = 1.4;
    this.visuals.add(body);

    // Kabine (Front = +Z — Turm-Rohre zeigen nach vorn)
    const cab = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.5, 2.4), olive);
    cab.position.set(0, 2.5, 2.2);
    this.visuals.add(cab);

    // Räder
    for (const z of [-2.2, 0.3, 2.4]) {
      for (const x of [-2.1, 2.1]) {
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.55, 10), rubber);
        w.rotation.z = Math.PI / 2;
        w.position.set(x, 0.75, z);
        this.visuals.add(w);
      }
    }

    // Ladefläche / Plattform
    const deck = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.25, 4), dark);
    deck.position.set(0, 2.15, -1.2);
    this.visuals.add(deck);

    // Turm (Yaw)
    const turret = new THREE.Group();
    turret.position.set(0, 2.4, -1.4);
    this.turret = turret;
    this.object.add(turret);

    const ring = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.4, 0.45, 12), accent);
    turret.add(ring);

    const housing = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.1, 1.8), olive);
    housing.position.y = 0.7;
    turret.add(housing);

    // Rohr-Pivot (Pitch) — Rohre zeigen Richtung +Z (vorwärts zum Ziel)
    const gunsPivot = new THREE.Group();
    gunsPivot.position.set(0, 0.85, 0);
    this.gunsPivot = gunsPivot;
    turret.add(gunsPivot);

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 4.2, 8), dark);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0, 1.8);
    gunsPivot.add(barrel);

    // Zwillingsrohr
    const barrel2 = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 3.6, 8), dark);
    barrel2.rotation.x = Math.PI / 2;
    barrel2.position.set(0.35, -0.15, 1.6);
    gunsPivot.add(barrel2);
  }

  /**
   * GLB-Visual (models/ground-vehicles.glb → AAA_Truck) gegen die
   * prozeduralen Platzhalter tauschen. Nodes: 'AAA_Turret' (Yaw), 'AAA_Guns' (Pitch).
   */
  attachGlb(model: THREE.Object3D): boolean {
    const turret = model.getObjectByName('AAA_Turret');
    const guns = model.getObjectByName('AAA_Guns');
    if (!turret || !guns) return false;
    this.object.remove(this.visuals);
    this.object.remove(this.turret);
    this.object.add(model);
    this.turret = turret;
    this.gunsPivot = guns;
    return true;
  }

  get position(): THREE.Vector3 {
    return this.object.position;
  }

  takeDamage(dmg: number): boolean {
    if (!this.alive) return false;
    this.hp -= dmg;
    if (this.hp <= 0) {
      this.alive = false;
      this.object.rotation.z = 0.35;
      this.object.position.y -= 0.4;
      return true;
    }
    return false;
  }

  /**
   * Trackt Spieler und feuert Flak-Salven.
   * onHitPlayer: direkter Schaden am Spieler (Arcade-Flak, kein Ballistik-Sim).
   * onShot: pro abgefeuertem Geschoss — für Tracer/Burst-Visuals + Sound.
   */
  update(
    dt: number,
    player: Aircraft,
    onHitPlayer: (dmg: number, from: AaaTruck) => void,
    onShot?: (muzzle: THREE.Vector3, aim: THREE.Vector3) => void
  ) {
    if (!this.alive) {
      this.burnTimer += dt;
      return;
    }
    if (!player.alive) return;

    const toPlayer = player.position.clone().sub(this.position);
    const dist = toPlayer.length();
    if (dist < 1) return;

    // Turm yaw + Rohr-Elevation (Rohre zeigen +Z → auf den Spieler)
    const yaw = Math.atan2(toPlayer.x, toPlayer.z);
    this.turret.rotation.y = yaw;
    const elev = Math.atan2(toPlayer.y - 2, Math.hypot(toPlayer.x, toPlayer.z));
    this.gunsPivot.rotation.x = -THREE.MathUtils.clamp(elev, -0.15, 1.1);

    if (dist > this.range || dist < 80) {
      this.burstLeft = 0;
      return;
    }

    // Nur feuern wenn Spieler grob im Sichtkegel (nicht hinter Hügel-Logik — Arcade)
    const flat = new THREE.Vector3(toPlayer.x, 0, toPlayer.z).normalize();
    const fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    if (flat.dot(fwd) < 0.55) return;

    this.fireTimer -= dt;
    if (this.fireTimer > 0) return;

    if (this.burstLeft <= 0) {
      // Neue Salve starten
      this.burstLeft = 4 + Math.floor(Math.random() * 4);
    }

    this.burstLeft -= 1;
    const speed = player.flight?.speed ?? 120;

    // Visual-Callback: Mündung (Welt) → gelegener Zielpunkt beim Spieler
    if (onShot) {
      this.gunsPivot.getWorldPosition(this._muzzle);
      const lead = Math.min(1.1, dist / 700);
      const aim = player.position
        .clone()
        .addScaledVector(player.flight?.velocityDir ?? new THREE.Vector3(), speed * lead)
        .add(
          new THREE.Vector3(
            (Math.random() - 0.5) * 55,
            (Math.random() - 0.5) * 38,
            (Math.random() - 0.5) * 55
          )
        );
      onShot(this._muzzle, aim);
    }

    const hitChance =
      0.11 *
      THREE.MathUtils.clamp(1.15 - dist / this.range, 0.15, 1) *
      THREE.MathUtils.clamp(1.1 - speed / 280, 0.35, 1);
    if (Math.random() < hitChance) {
      onHitPlayer(this.dmg, this);
    }

    if (this.burstLeft > 0) {
      this.fireTimer = this.fireInterval;
    } else {
      // Pause zwischen Salven
      this.fireTimer = 1.6 + Math.random() * 2.4;
    }
  }
}
