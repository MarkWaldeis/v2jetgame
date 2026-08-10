import * as THREE from 'three';
import type { JetLandingGearSpec } from './JetCatalog';

/**
 * Einfaches, robustes Dreipunkt-Fahrwerk für normalisierte Jet-GLBs.
 * Die importierten Modelle enthalten sehr unterschiedliche Gear-Hierarchien;
 * daher nutzt das Spiel ein konsistentes prozedurales Fahrwerk mit Jet-Profilen.
 */
export class LandingGearVisual {
  readonly group = new THREE.Group();
  private assemblies: THREE.Group[] = [];
  private progress = 0;
  private target = 0;
  private retractSpeed = 1.8;

  constructor() {
    this.group.name = 'landingGear';
    this.group.visible = false;
  }

  configure(spec: JetLandingGearSpec) {
    this.group.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach((material) => material.dispose());
    });
    this.group.clear();
    this.assemblies = [];
    this.retractSpeed = spec.retractSpeed;

    const strutMaterial = new THREE.MeshStandardMaterial({
      color: 0xb8bec3,
      roughness: 0.42,
      metalness: 0.72,
    });
    const hubMaterial = new THREE.MeshStandardMaterial({
      color: 0x6f7579,
      roughness: 0.5,
      metalness: 0.62,
    });
    const tireMaterial = new THREE.MeshStandardMaterial({
      color: 0x17191b,
      roughness: 0.96,
      metalness: 0.02,
    });

    const mounts = [spec.noseMount, spec.leftMainMount, spec.rightMainMount];
    mounts.forEach((mount, index) => {
      const assembly = new THREE.Group();
      assembly.name = index === 0 ? 'noseGear' : index === 1 ? 'leftMainGear' : 'rightMainGear';
      assembly.position.set(...mount);

      const strutLength = index === 0 ? spec.noseStrutLength : spec.mainStrutLength;
      const strut = new THREE.Mesh(
        new THREE.CylinderGeometry(spec.wheelRadius * 0.18, spec.wheelRadius * 0.24, strutLength, 8),
        strutMaterial
      );
      strut.position.y = -strutLength * 0.5;
      assembly.add(strut);

      const fork = new THREE.Mesh(
        new THREE.BoxGeometry(spec.wheelRadius * 0.24, spec.wheelRadius * 0.72, spec.wheelRadius * 1.28),
        hubMaterial
      );
      fork.position.y = -strutLength + spec.wheelRadius * 0.12;
      assembly.add(fork);

      const wheel = new THREE.Mesh(
        new THREE.CylinderGeometry(spec.wheelRadius, spec.wheelRadius, spec.wheelWidth, 14),
        tireMaterial
      );
      wheel.rotation.z = Math.PI / 2;
      wheel.position.y = -strutLength;
      assembly.add(wheel);

      assembly.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.castShadow = false;
          mesh.receiveShadow = false;
        }
      });

      this.assemblies.push(assembly);
      this.group.add(assembly);
    });

    this.applyPose();
  }

  setExtended(extended: boolean, immediate = false) {
    this.target = extended ? 1 : 0;
    if (immediate) {
      this.progress = this.target;
      this.applyPose();
    }
  }

  update(dt: number) {
    const step = Math.max(0, dt) * this.retractSpeed;
    if (this.progress < this.target) this.progress = Math.min(this.target, this.progress + step);
    else if (this.progress > this.target) this.progress = Math.max(this.target, this.progress - step);
    this.applyPose();
  }

  get extension(): number {
    return this.progress;
  }

  private applyPose() {
    this.group.visible = this.progress > 0.015;
    const retractAngle = (1 - this.progress) * Math.PI * 0.48;
    this.assemblies.forEach((assembly, index) => {
      const side = index === 1 ? -1 : 1;
      assembly.rotation.x = index === 0 ? retractAngle : retractAngle * 0.82;
      assembly.rotation.z = index === 0 ? 0 : side * retractAngle * 0.18;
      assembly.scale.set(1, 0.82 + this.progress * 0.18, 1);
    });
  }
}
