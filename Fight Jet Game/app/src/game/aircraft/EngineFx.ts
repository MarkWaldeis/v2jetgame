import * as THREE from 'three';

interface NozzleFx {
  group: THREE.Group;
  /** Leuchtender Kern der Düse (sitzt in der Öffnung) */
  throat: THREE.Mesh;
  disc: THREE.Mesh;
  ring: THREE.Mesh;
  halo: THREE.Mesh;
  core: THREE.Mesh;
  mid: THREE.Mesh;
  outer: THREE.Mesh;
  diamonds: THREE.Mesh[];
  phase: number;
  radius: number;
}

const additive = (color: number, opacity = 0) =>
  new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });

/**
 * Triebwerks-FX: Flamme beginnt **in** der Düse (Local +Z = Heck).
 * Throat/Disc auf Austrittsebene z≈0, Plume ausschließlich nach +Z.
 */
export class EngineFx {
  readonly group = new THREE.Group();
  private nozzles: NozzleFx[] = [];
  private light = new THREE.PointLight(0x77aaff, 0, 36);
  private time = 0;
  private level = 0;
  private fxScale = 1;

  constructor(
    nozzles: THREE.Vector3[] = [new THREE.Vector3(0, -0.05, 7.4)],
    scale = 1,
    radii?: number[]
  ) {
    this.group.name = 'engineFx';
    this.configure(nozzles, scale, radii);
  }

  configure(nozzles: THREE.Vector3[], scale = 1, radii?: number[]) {
    this.group.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) material.dispose();
    });
    this.group.clear();
    this.nozzles = [];
    this.fxScale = scale;

    // Kegel: Basis bei z=0 (Düsenlippe), Spitze bei z=+1 (Heckstrom)
    const makeCone = (radius: number, segments = 22) => {
      const geometry = new THREE.ConeGeometry(radius, 1, segments, 1, true);
      geometry.rotateX(Math.PI / 2);
      geometry.translate(0, 0, 0.5);
      return geometry;
    };

    nozzles.forEach((position, index) => {
      const r0 = radii?.[index] ?? 0.28 * scale;
      const r = THREE.MathUtils.clamp(r0, 0.12, 0.55);
      const nozzle = new THREE.Group();
      nozzle.name = `engineNozzleFx-${index}`;
      nozzle.position.copy(position);

      // ── Throat: sitzt leicht **vor** der Lippe (negatives Z) = im Rohr ──
      const throat = new THREE.Mesh(
        new THREE.CircleGeometry(r * 0.92, 32),
        additive(0xffc998)
      );
      throat.position.z = -r * 0.22;
      nozzle.add(throat);

      // Austrittsscheibe (knapp hinter Throat, noch im / am Rand)
      const disc = new THREE.Mesh(new THREE.CircleGeometry(r * 0.78, 32), additive(0xffe8d0));
      disc.position.z = -r * 0.04;
      nozzle.add(disc);

      // Weicher Glow-Halo (dünn, nicht riesig außerhalb)
      const halo = new THREE.Mesh(new THREE.CircleGeometry(r * 1.35, 32), additive(0x4a8cff));
      halo.position.z = 0.01;
      nozzle.add(halo);

      // Düsenring auf der Lippe
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(r * 0.88, r * 0.1, 10, 36),
        additive(0x9fd0ff)
      );
      ring.position.z = 0.02;
      nozzle.add(ring);

      // Gestaffelte Plume: hot core → mid → cool outer
      const core = new THREE.Mesh(makeCone(r * 0.42, 20), additive(0xfff0d8));
      const mid = new THREE.Mesh(makeCone(r * 0.72, 22), additive(0xffaa66));
      const outer = new THREE.Mesh(makeCone(r * 1.05, 24), additive(0x3a7cff));
      // Leicht hinter der Lippe starten, damit Basis in der Öffnung steckt
      core.position.z = -r * 0.08;
      mid.position.z = -r * 0.05;
      outer.position.z = 0;
      nozzle.add(outer, mid, core);

      // Shock-Diamonds (nur AB)
      const diamonds: THREE.Mesh[] = [];
      for (let d = 0; d < 4; d++) {
        const diamond = new THREE.Mesh(
          new THREE.OctahedronGeometry(r * 0.55, 0),
          additive(d === 0 ? 0xe8f4ff : 0x7eb0ff)
        );
        diamond.position.z = r * 1.1 + d * r * 1.35;
        nozzle.add(diamond);
        diamonds.push(diamond);
      }

      this.group.add(nozzle);
      this.nozzles.push({
        group: nozzle,
        throat,
        disc,
        ring,
        halo,
        core,
        mid,
        outer,
        diamonds,
        phase: index * 1.73,
        radius: r,
      });
    });

    const centroid = new THREE.Vector3();
    for (const position of nozzles) centroid.add(position);
    if (nozzles.length) centroid.divideScalar(nozzles.length);
    this.light.position.copy(centroid).add(new THREE.Vector3(0, 0, 1.1 * scale));
    this.group.add(this.light);
  }

  update(dt: number, throttle: number, afterburner: boolean) {
    this.time += dt;
    const dryPower = THREE.MathUtils.clamp(0.08 + throttle * 0.42, 0.08, 0.48);
    const target = afterburner ? 1 : dryPower;
    this.level += (target - this.level) * Math.min(1, dt * (afterburner ? 10 : 5.5));

    this.nozzles.forEach((nozzle) => {
      const flutter =
        0.93 +
        Math.sin(this.time * 33 + nozzle.phase) * 0.04 +
        Math.sin(this.time * 57 + nozzle.phase * 0.7) * 0.022;
      const level = this.level * flutter;
      const ab = afterburner ? THREE.MathUtils.smoothstep(this.level, 0.42, 0.95) : 0;
      const r = nozzle.radius;

      // Throat: heiß im Rohr
      const throatMat = nozzle.throat.material as THREE.MeshBasicMaterial;
      throatMat.color.setHex(afterburner ? 0xffd4a0 : 0x9ec4ff);
      throatMat.opacity = level * (afterburner ? 0.78 : 0.38);
      nozzle.throat.scale.setScalar(0.92 + level * 0.1);

      const discMat = nozzle.disc.material as THREE.MeshBasicMaterial;
      discMat.color.setHex(afterburner ? 0xffe8cc : 0xb0d0ff);
      discMat.opacity = level * (afterburner ? 0.7 : 0.32);
      nozzle.disc.scale.setScalar(0.9 + level * 0.12);

      const ringMat = nozzle.ring.material as THREE.MeshBasicMaterial;
      ringMat.color.setHex(afterburner ? 0xc8e4ff : 0x6a9ad0);
      ringMat.opacity = level * (afterburner ? 0.55 : 0.28);
      nozzle.ring.scale.setScalar(0.96 + level * 0.06);

      const haloMat = nozzle.halo.material as THREE.MeshBasicMaterial;
      haloMat.opacity = level * (afterburner ? 0.16 : 0.07);
      nozzle.halo.scale.setScalar(0.9 + level * (afterburner ? 0.28 : 0.1));

      // Plume-Längen in Einheiten des Kegel-Geometrie-z (Scale.z)
      const coreLen = (afterburner ? 2.4 + flutter * 0.35 : 0.55 + level * 0.7) * (r / 0.28);
      const midLen = (afterburner ? 3.4 + flutter * 0.4 : 0.85 + level * 0.9) * (r / 0.28);
      const outerLen = (afterburner ? 4.6 + flutter * 0.5 : 1.15 + level * 1.1) * (r / 0.28);
      const wCore = 0.85 + level * 0.2;
      const wMid = 0.9 + level * 0.22;
      const wOuter = 0.95 + level * 0.25;

      nozzle.core.scale.set(wCore, wCore, coreLen);
      nozzle.mid.scale.set(wMid, wMid, midLen);
      nozzle.outer.scale.set(wOuter, wOuter, outerLen);

      const coreMat = nozzle.core.material as THREE.MeshBasicMaterial;
      coreMat.color.setHex(afterburner ? 0xfff2dc : 0xc8e0ff);
      coreMat.opacity = level * (afterburner ? 0.72 : 0.32);

      const midMat = nozzle.mid.material as THREE.MeshBasicMaterial;
      midMat.color.setHex(afterburner ? 0xff9a45 : 0x6a9fff);
      midMat.opacity = level * (afterburner ? 0.38 : 0.14);

      const outerMat = nozzle.outer.material as THREE.MeshBasicMaterial;
      outerMat.color.setHex(afterburner ? 0x2f6fff : 0x2a5088);
      outerMat.opacity = level * (afterburner ? 0.2 : 0.09);

      nozzle.diamonds.forEach((diamond, index) => {
        const visible = ab > 0.03;
        diamond.visible = visible;
        if (!visible) return;
        diamond.position.z =
          r * (1.15 + index * 1.25) + Math.sin(this.time * 18 + index) * r * 0.06;
        const s = r * (0.9 + index * 0.08) * (0.85 + ab * 0.25);
        diamond.scale.set(s, s, s * 1.35);
        (diamond.material as THREE.MeshBasicMaterial).opacity =
          ab * (0.28 - index * 0.045) * flutter;
      });

      const visible = level > 0.02;
      nozzle.throat.visible = visible;
      nozzle.disc.visible = visible;
      nozzle.ring.visible = visible;
      nozzle.halo.visible = visible;
      nozzle.core.visible = visible;
      nozzle.mid.visible = visible;
      nozzle.outer.visible = visible;
    });

    this.light.intensity =
      this.level * (afterburner ? 8.5 : 1.8) * Math.max(1, this.nozzles.length * 0.6);
    this.light.distance = (afterburner ? 36 : 18) * this.fxScale;
    this.light.color.setHex(afterburner ? 0x88b8ff : 0x5578aa);
  }

  setAfterburner(on: boolean) {
    if (on) this.level = Math.max(this.level, 0.88);
  }
}
