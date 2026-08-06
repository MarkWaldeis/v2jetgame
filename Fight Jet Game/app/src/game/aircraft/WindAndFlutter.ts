import * as THREE from 'three';

/**
 * Globale Wind-/Turbulenz-Simulation + Wing-Flutter (visuell).
 * Ältere Leichtbau-Flugzeuge (Propeller, frühe Jets) reagieren stärker.
 */
export class WindField {
  /** Welt-Wind (m/s) */
  readonly wind = new THREE.Vector3(4, 0, -2);
  /** Gust vector (m/s), smoothed */
  readonly gust = new THREE.Vector3();
  private time = 0;
  private gustPhase = Math.random() * 100;
  private targetGust = new THREE.Vector3();
  private gustTimer = 0;

  update(dt: number) {
    this.time += dt;
    this.gustTimer -= dt;
    if (this.gustTimer <= 0) {
      this.gustTimer = 1.4 + Math.random() * 2.8;
      // Böen bis ~16 m/s — spürbar, aber nicht unkontrollierbar
      this.targetGust.set(
        (Math.random() - 0.5) * 18,
        (Math.random() - 0.5) * 5.5,
        (Math.random() - 0.5) * 18
      );
    }
    const k = 1 - Math.exp(-1.35 * dt);
    this.gust.lerp(this.targetGust, k);
    // Basiswind driftet (etwas stärker als zuvor)
    this.wind.x = 5.5 + Math.sin(this.time * 0.07 + this.gustPhase) * 3.2;
    this.wind.z = -2.2 + Math.cos(this.time * 0.05) * 2.8;
    this.wind.y = Math.sin(this.time * 0.11) * 0.9;
  }

  /** Gesamtwind am Ort (inkl. leichter räumlicher Variation) */
  sample(pos: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    const spatial =
      Math.sin(pos.x * 0.0008 + this.time * 0.4) *
      Math.cos(pos.z * 0.0007 + this.time * 0.35);
    out.copy(this.wind).add(this.gust);
    out.x += spatial * 4;
    out.y += spatial * 1.6;
    return out;
  }
}

export type FlutterInput = {
  speed: number;
  cruiseSpeed: number;
  maxSpeed: number;
  gForce: number;
  aoa: number;
  stalled: boolean;
  windStrength: number;
  /** 0 = modern jet (wenig), 1+ = leichte Propellerzelle */
  susceptibility: number;
};

/**
 * Visuelles Flügel-Flattern / Rumpfzittern durch lokale Micro-Rotation am Visual.
 */
export class WingFlutter {
  private time = 0;
  private intensity = 0;
  private basePos = new THREE.Vector3();
  private baseQuat = new THREE.Quaternion();
  private captured = false;
  private visual: THREE.Object3D | null = null;
  private _q = new THREE.Quaternion();
  private _e = new THREE.Euler();

  /** Buffeting 0..1 für Kamera (Stall-Vorwarnung + Flutter) */
  buffeting = 0;

  attach(visual: THREE.Object3D) {
    this.visual = visual;
    this.basePos.copy(visual.position);
    this.baseQuat.copy(visual.quaternion);
    this.captured = true;
    this.intensity = 0;
    this.buffeting = 0;
  }

  reset() {
    if (this.visual && this.captured) {
      this.visual.position.copy(this.basePos);
      this.visual.quaternion.copy(this.baseQuat);
    }
    this.intensity = 0;
    this.buffeting = 0;
  }

  update(dt: number, input: FlutterInput) {
    if (!this.visual || !this.captured) return;
    this.time += dt;

    const speedNorm = THREE.MathUtils.clamp(input.speed / Math.max(40, input.maxSpeed), 0, 1.4);
    const overspeed = Math.max(0, speedNorm - 0.72);
    const highG = Math.max(0, input.gForce - 4.2) / 6;
    const aoaFactor = Math.max(0, Math.abs(input.aoa) - 0.22) * 2.2;
    const windF = THREE.MathUtils.clamp(input.windStrength / 12, 0, 1.5);
    const stallProx =
      input.stalled
        ? 1
        : THREE.MathUtils.smoothstep(
            1 - input.speed / Math.max(50, input.cruiseSpeed * 0.55),
            0,
            1
          );

    let target =
      (overspeed * 0.55 + highG * 0.7 + aoaFactor * 0.45 + windF * 0.35 + stallProx * 0.9) *
      (0.35 + input.susceptibility);

    // Moderne Jets: stark dämpfen
    target *= THREE.MathUtils.clamp(input.susceptibility, 0.15, 2.2);
    target = THREE.MathUtils.clamp(target, 0, 1.8);

    this.intensity += (target - this.intensity) * Math.min(1, dt * 5);
    this.buffeting = THREE.MathUtils.clamp(
      this.intensity * 0.55 + stallProx * 0.65 * input.susceptibility,
      0,
      1.5
    );

    // Visuelles Zittern: Sinus auf Pitch/Roll/Yaw + leichte Position
    const amp = this.intensity * 0.012; // rad
    const f1 = 18 + input.susceptibility * 6;
    const f2 = 29;
    const f3 = 41;
    const t = this.time;
    this._e.set(
      Math.sin(t * f1) * amp * 1.1 + Math.sin(t * f3) * amp * 0.35,
      Math.sin(t * f2 * 0.7) * amp * 0.45,
      Math.cos(t * f2) * amp * 1.3 + Math.sin(t * f1 * 1.3) * amp * 0.4
    );
    this._q.setFromEuler(this._e);
    this.visual.quaternion.copy(this.baseQuat).multiply(this._q);
    this.visual.position.set(
      this.basePos.x + Math.sin(t * f2) * amp * 0.8,
      this.basePos.y + Math.cos(t * f1) * amp * 0.5,
      this.basePos.z
    );
  }
}
