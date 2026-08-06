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

// SAM-Site: Radar-Rotator + 2 Werfer auf dem Terrain. Feuert SAMs auf den
// Spieler, wenn er in Reichweite ist. Zerstörbar mit Kanone & Raketen.
export class SamSite implements Damageable {
  readonly object = new THREE.Group();
  readonly isPlayer = false;
  readonly name: string;
  alive = true;
  hp = CONFIG.mission.samHp;
  private radarDish: THREE.Mesh;
  private fireTimer: number;
  private burnTimer = 0;

  constructor(index: number, pos: THREE.Vector3) {
    this.name = `SAM ${index + 1}`;
    this.object.position.copy(pos);
    this.fireTimer = 3 + Math.random() * CONFIG.mission.samFireInterval;

    const concreteMat = new THREE.MeshStandardMaterial({ color: 0x8b8578, roughness: 0.9 });
    const armyMat = new THREE.MeshStandardMaterial({ color: 0x4a5238, roughness: 0.7, metalness: 0.3 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x2c2e30, roughness: 0.6, metalness: 0.4 });

    // Bunker-Sockel
    const base = new THREE.Mesh(new THREE.CylinderGeometry(6, 7, 2, 8), concreteMat);
    base.position.y = 1;
    this.object.add(base);

    // Radar-Mast + rotierende Schüssel
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 5, 8), darkMat);
    mast.position.y = 4;
    this.object.add(mast);
    this.radarDish = new THREE.Mesh(new THREE.SphereGeometry(2.2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2.6), armyMat);
    this.radarDish.position.y = 7;
    this.radarDish.rotation.x = Math.PI / 3;
    this.object.add(this.radarDish);

    // Zwei Werfer mit Rohren
    for (const side of [-1, 1]) {
      const launcher = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.2, 5), armyMat);
      launcher.position.set(side * 5.5, 1.8, 0);
      this.object.add(launcher);
      for (let i = 0; i < 4; i++) {
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 4.6, 8), darkMat);
        tube.rotation.x = -Math.PI / 4;
        tube.position.set(side * 5.5 - 0.7 + (i % 2) * 1.4, 2.8, -0.5 + Math.floor(i / 2) * 0.9);
        this.object.add(tube);
      }
    }

    // Warn-Farbmarkierung
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(6.05, 6.05, 0.4, 8),
      new THREE.MeshStandardMaterial({ color: 0xc8a23a, roughness: 0.8 }));
    stripe.position.y = 1.8;
    this.object.add(stripe);
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

  // true = will jetzt eine SAM abfeuern
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
      this.fireTimer = CONFIG.mission.samFireInterval * (0.8 + Math.random() * 0.4);
      onFire(this);
    }
  }
}
