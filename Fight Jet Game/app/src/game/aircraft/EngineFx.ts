import * as THREE from 'three';

interface NozzleFx {
  group: THREE.Group;
  disc: THREE.Mesh;
  ring: THREE.Mesh;
  halo: THREE.Mesh;
  core: THREE.Mesh;
  outer: THREE.Mesh;
  diamonds: THREE.Mesh[];
  phase: number;
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
 * Saubere, modellkalibrierte Triebwerks-FX.
 * Local +Z ist das Heck: jede Flamme beginnt plan am realen Duesenaustritt
 * und verlaeuft ausschliesslich hinter dem Jet.
 */
export class EngineFx {
  readonly group = new THREE.Group();
  private nozzles: NozzleFx[] = [];
  private light = new THREE.PointLight(0x77aaff, 0, 36);
  private time = 0;
  private level = 0;
  private fxScale = 1;

  constructor(nozzles: THREE.Vector3[] = [new THREE.Vector3(0, -0.05, 7.4)], scale = 1) {
    this.group.name = 'engineFx';
    this.configure(nozzles, scale);
  }

  configure(nozzles: THREE.Vector3[], scale = 1) {
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

    // Einheitskegel: breite Basis exakt bei z=0, Spitze bei z=+1.
    const makeCone = (radius: number, segments = 20) => {
      const geometry = new THREE.ConeGeometry(radius, 1, segments, 1, true);
      geometry.rotateX(Math.PI / 2);
      geometry.translate(0, 0, 0.5);
      return geometry;
    };

    nozzles.forEach((position, index) => {
      const nozzle = new THREE.Group();
      nozzle.name = `engineNozzleFx-${index}`;
      nozzle.position.copy(position);

      // Duenenring und weicher Halo bleiben direkt auf der Austrittsebene.
      const halo = new THREE.Mesh(new THREE.CircleGeometry(0.58, 28), additive(0x4b8cff));
      halo.position.z = 0.018;
      nozzle.add(halo);

      const disc = new THREE.Mesh(new THREE.CircleGeometry(0.31, 28), additive(0xd9efff));
      disc.position.z = 0.026;
      nozzle.add(disc);

      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.045, 8, 28), additive(0x78bfff));
      ring.position.z = 0.035;
      nozzle.add(ring);

      // Gestaffelter Kern und transparente Mantelflamme.
      const core = new THREE.Mesh(makeCone(0.19, 18), additive(0xffead0));
      const outer = new THREE.Mesh(makeCone(0.35, 22), additive(0x397cff));
      nozzle.add(outer, core);

      // Dezente Shock-Diamonds geben dem Nachbrenner Tiefe, ohne die Duesen
      // mit einer weissen Scheibe zu ueberstrahlen.
      const diamonds: THREE.Mesh[] = [];
      for (let d = 0; d < 3; d++) {
        const diamond = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.23, 0),
          additive(d === 0 ? 0xcce8ff : 0x78a7ff)
        );
        diamond.position.z = 0.65 + d * 0.62;
        nozzle.add(diamond);
        diamonds.push(diamond);
      }

      this.group.add(nozzle);
      this.nozzles.push({
        group: nozzle,
        disc,
        ring,
        halo,
        core,
        outer,
        diamonds,
        phase: index * 1.73,
      });
    });

    const centroid = new THREE.Vector3();
    for (const position of nozzles) centroid.add(position);
    if (nozzles.length) centroid.divideScalar(nozzles.length);
    this.light.position.copy(centroid).add(new THREE.Vector3(0, 0, 1.2 * scale));
    this.group.add(this.light);
  }

  update(dt: number, throttle: number, afterburner: boolean) {
    this.time += dt;
    const dryPower = THREE.MathUtils.clamp(0.06 + throttle * 0.38, 0.06, 0.44);
    const target = afterburner ? 1 : dryPower;
    this.level += (target - this.level) * Math.min(1, dt * (afterburner ? 9 : 5));

    const scale = this.fxScale;
    this.nozzles.forEach((nozzle) => {
      const flutter =
        0.92 +
        Math.sin(this.time * 31 + nozzle.phase) * 0.045 +
        Math.sin(this.time * 53 + nozzle.phase * 0.7) * 0.025;
      const level = this.level * flutter;
      const ab = afterburner ? THREE.MathUtils.smoothstep(this.level, 0.45, 0.95) : 0;

      const discMaterial = nozzle.disc.material as THREE.MeshBasicMaterial;
      discMaterial.color.setHex(afterburner ? 0xffe8cc : 0x8ab7ff);
      discMaterial.opacity = level * (afterburner ? 0.62 : 0.28);
      nozzle.disc.scale.setScalar(scale * (0.88 + level * 0.12));

      const ringMaterial = nozzle.ring.material as THREE.MeshBasicMaterial;
      ringMaterial.color.setHex(afterburner ? 0xb7d8ff : 0x557fc2);
      ringMaterial.opacity = level * (afterburner ? 0.5 : 0.22);
      nozzle.ring.scale.setScalar(scale * (0.94 + level * 0.08));

      const haloMaterial = nozzle.halo.material as THREE.MeshBasicMaterial;
      haloMaterial.opacity = level * (afterburner ? 0.18 : 0.08);
      nozzle.halo.scale.setScalar(scale * (0.86 + level * (afterburner ? 0.3 : 0.1)));

      const coreLength = scale * (afterburner ? 1.4 + flutter * 0.22 : 0.36 + level * 0.42);
      const coreWidth = scale * (0.72 + level * 0.16);
      nozzle.core.scale.set(coreWidth, coreWidth, coreLength);
      const coreMaterial = nozzle.core.material as THREE.MeshBasicMaterial;
      coreMaterial.color.setHex(afterburner ? 0xffdfb8 : 0x8fbfff);
      coreMaterial.opacity = level * (afterburner ? 0.58 : 0.24);

      const outerLength = scale * (afterburner ? 2.25 + flutter * 0.32 : 0.58 + level * 0.55);
      const outerWidth = scale * (0.78 + level * 0.18);
      nozzle.outer.scale.set(outerWidth, outerWidth, outerLength);
      const outerMaterial = nozzle.outer.material as THREE.MeshBasicMaterial;
      outerMaterial.color.setHex(afterburner ? 0x377dff : 0x315d9f);
      outerMaterial.opacity = level * (afterburner ? 0.22 : 0.1);

      nozzle.diamonds.forEach((diamond, index) => {
        const visible = ab > 0.02;
        diamond.visible = visible;
        if (!visible) return;
        diamond.position.z = scale * (0.68 + index * 0.62 + Math.sin(this.time * 17 + index) * 0.025);
        diamond.scale.set(scale * 0.44, scale * 0.44, scale * (0.62 + index * 0.06));
        (diamond.material as THREE.MeshBasicMaterial).opacity = ab * (0.24 - index * 0.045) * flutter;
      });

      const visible = level > 0.025;
      nozzle.disc.visible = visible;
      nozzle.ring.visible = visible;
      nozzle.halo.visible = visible;
      nozzle.core.visible = visible;
      nozzle.outer.visible = visible;
    });

    this.light.intensity = this.level * (afterburner ? 7 : 1.5) * Math.max(1, this.nozzles.length * 0.65);
    this.light.distance = (afterburner ? 34 : 16) * scale;
    this.light.color.setHex(afterburner ? 0x72a9ff : 0x4f73aa);
  }

  setAfterburner(on: boolean) {
    if (on) this.level = Math.max(this.level, 0.88);
  }
}
