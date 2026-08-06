import * as THREE from 'three';

// Prop_16, Prop.001, propeller, blade, rotor, spinner …
const PROP_NAME_RE = /prop(?!ulsion)|blade|rotor|airscrew|air.?screw|spinner/i;

export type PropellerState = {
  /** 0..1 current RPM relative to max */
  rpm: number;
  /** Prop disc blur active (high RPM) */
  blurred: boolean;
};

/**
 * Findet Propeller-Meshes im GLB und dreht sie je nach Schub/RPM.
 * Bei hoher Drehzahl: Motion-Blur-Scheibe (halbtransparenter Kreis).
 */
export class PropellerSystem {
  private propNodes: THREE.Object3D[] = [];
  private blurDiscs: THREE.Mesh[] = [];
  private rpm = 0;
  private spinAngle = 0;
  private enabled = false;

  /** Sucht Propeller-Knoten und baut Blur-Discs. */
  attach(visualRoot: THREE.Object3D) {
    this.disposeBlur();
    this.propNodes = [];
    this.enabled = false;

    const candidates: THREE.Object3D[] = [];
    visualRoot.traverse((obj) => {
      if (!obj.name) return;
      if (PROP_NAME_RE.test(obj.name)) candidates.push(obj);
    });

    // Dedup: wenn Parent schon Propeller ist, Kinder nicht doppelt
    const filtered = candidates.filter((node) => {
      let p = node.parent;
      while (p && p !== visualRoot) {
        if (candidates.includes(p)) return false;
        p = p.parent;
      }
      return true;
    });

    this.propNodes = filtered;

    // Fallback: vorderstes Mesh (Bug-Nähe) ODER synthetischer Spinner am Bug
    if (this.propNodes.length === 0) {
      const auto = this.findLikelyPropHub(visualRoot);
      if (auto) {
        this.propNodes.push(auto);
      } else {
        const synth = this.createSyntheticSpinner(visualRoot);
        if (synth) this.propNodes.push(synth);
      }
    }

    for (const node of this.propNodes) {
      this.createBlurDisc(node);
    }

    this.enabled = this.propNodes.length > 0;
    return this.enabled;
  }

  get active() {
    return this.enabled;
  }

  get state(): PropellerState {
    return { rpm: this.rpm, blurred: this.rpm > 0.55 };
  }

  /**
   * @param throttle 0..1
   * @param speedNorm speed relative to cruise (for idle spin in flight)
   */
  update(dt: number, throttle: number, speedNorm: number) {
    if (!this.enabled) return;

    // Idle spin in flight even at low throttle; RPM rises with throttle
    const targetRpm = THREE.MathUtils.clamp(0.12 + throttle * 0.88 + speedNorm * 0.08, 0, 1.15);
    this.rpm += (targetRpm - this.rpm) * Math.min(1, dt * 3.5);

    // rad/s: idle ~40, full ~180
    const spinRate = 35 + this.rpm * 160;
    this.spinAngle += spinRate * dt;

    // Spin around local forward (typically local −Z after orient; try Z first as props face nose)
    for (const node of this.propNodes) {
      // Rotate around the prop's local Z (blade disc plane = XY of prop hub in most assets)
      node.rotation.z = this.spinAngle;
    }

    // Blur: hide individual blades / show disc at high RPM
    const blurOn = this.rpm > 0.52;
    const blurOpacity = THREE.MathUtils.smoothstep(this.rpm, 0.45, 0.85) * 0.55;
    for (let i = 0; i < this.propNodes.length; i++) {
      const node = this.propNodes[i];
      const disc = this.blurDiscs[i];
      if (disc) {
        disc.visible = blurOn;
        const mat = disc.material as THREE.MeshBasicMaterial;
        mat.opacity = blurOpacity;
      }
      // At high RPM, slightly fade solid prop meshes for blur effect
      if (blurOn) {
        node.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh || m === disc) return;
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          for (const mat of mats) {
            if (!mat) continue;
            const bm = mat as THREE.MeshBasicMaterial & { transparent?: boolean; opacity?: number };
            if ('opacity' in bm && typeof bm.opacity === 'number') {
              if (!(bm as { userData?: { _propOp?: number } }).userData) {
                (m as THREE.Object3D).userData = (m as THREE.Object3D).userData || {};
              }
              const ud = m.userData as { _propBaseOp?: number };
              if (ud._propBaseOp === undefined) ud._propBaseOp = bm.opacity ?? 1;
              bm.transparent = true;
              bm.opacity = ud._propBaseOp * (1 - blurOpacity * 0.85);
              bm.needsUpdate = true;
            }
          }
        });
      } else {
        node.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          for (const mat of mats) {
            if (!mat) continue;
            const ud = m.userData as { _propBaseOp?: number };
            const bm = mat as THREE.MeshBasicMaterial;
            if (ud._propBaseOp !== undefined && 'opacity' in bm) {
              bm.opacity = ud._propBaseOp;
            }
          }
        });
      }
    }
  }

  dispose() {
    this.disposeBlur();
    this.propNodes = [];
    this.enabled = false;
  }

  private disposeBlur() {
    for (const disc of this.blurDiscs) {
      disc.geometry.dispose();
      (disc.material as THREE.Material).dispose();
      disc.parent?.remove(disc);
    }
    this.blurDiscs = [];
  }

  private createBlurDisc(propNode: THREE.Object3D) {
    // Estimate prop radius from local bbox
    const box = new THREE.Box3().setFromObject(propNode);
    const size = box.getSize(new THREE.Vector3());
    const radius = Math.max(size.x, size.y, size.z) * 0.55;
    const r = THREE.MathUtils.clamp(radius, 0.8, 4.5);

    const geo = new THREE.CircleGeometry(r, 48);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xb8c0c8,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
    const disc = new THREE.Mesh(geo, mat);
    disc.name = 'propBlurDisc';
    disc.visible = false;
    // Disc in prop plane (XY of prop); most props spin around Z
    disc.position.set(0, 0, 0);
    propNode.add(disc);
    this.blurDiscs.push(disc);
  }

  /** Heuristik: Mesh-Gruppe am Bug (min Z), die flach und rund wirkt */
  private findLikelyPropHub(root: THREE.Object3D): THREE.Object3D | null {
    let best: THREE.Object3D | null = null;
    let bestScore = -Infinity;
    const rootBox = new THREE.Box3().setFromObject(root);
    const rootSize = rootBox.getSize(new THREE.Vector3());
    const noseZ = rootBox.min.z;

    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      // Niemals den Rumpf drehen — nur kleine Naben/Blätter am Bug
      const box = new THREE.Box3().setFromObject(mesh);
      const size = box.getSize(new THREE.Vector3());
      const volume = size.x * size.y * size.z;
      const rootVol = rootSize.x * rootSize.y * rootSize.z;
      if (volume > rootVol * 0.12) return;
      if (Math.max(size.x, size.y, size.z) > rootSize.x * 0.55) return;
      if (Math.max(size.x, size.y, size.z) > rootSize.z * 0.45) return;

      const center = box.getCenter(new THREE.Vector3());
      const noseDist = Math.abs(center.z - noseZ);
      const discLike = Math.min(size.x, size.y) / Math.max(size.z, 0.01);
      const score =
        (1 - noseDist / Math.max(rootSize.z, 1)) * 3 +
        Math.min(discLike, 8) * 0.4 -
        Math.abs(center.x) * 0.2;
      if (score > bestScore && noseDist < rootSize.z * 0.2) {
        bestScore = score;
        best = mesh;
      }
    });
    return best;
  }

  /**
   * Wenn kein Propeller-Mesh gefunden: unsichtbarer Pivot + sichtbare
   * Blur-Scheibe am Bug (funktioniert auch bei undifferenzierten GLBs).
   *
   * Wichtig: Position in ROOT-LOKALEN Koordinaten (nicht Welt) — sonst
   * landet der Spinner bei Spieler-Welt-Z (z. B. 3000 → lokaler Offset 65+).
   */
  private createSyntheticSpinner(root: THREE.Object3D): THREE.Object3D | null {
    root.updateMatrixWorld(true);
    const worldBox = new THREE.Box3().setFromObject(root);
    if (worldBox.isEmpty()) return null;

    // Welt-AABB → root-lokal
    const minL = worldBox.min.clone();
    const maxL = worldBox.max.clone();
    root.worldToLocal(minL);
    root.worldToLocal(maxL);
    const size = new THREE.Vector3(
      Math.abs(maxL.x - minL.x),
      Math.abs(maxL.y - minL.y),
      Math.abs(maxL.z - minL.z)
    );
    if (size.z < 0.5) return null;

    const hub = new THREE.Group();
    hub.name = 'syntheticPropHub';
    // Bug = min Z nach Normalisierung (Nase −Z), in root-lokal
    const noseZ = Math.min(minL.z, maxL.z);
    const midY = (minL.y + maxL.y) * 0.5;
    const radius = THREE.MathUtils.clamp(Math.max(size.x, size.y) * 0.28, 1.2, 3.2);
    hub.position.set(0, midY + size.y * 0.02, noseZ + radius * 0.05);

    // 3 einfache „Blätter“ als Low-RPM-Indikator
    const bladeGeo = new THREE.BoxGeometry(radius * 1.7, 0.08, 0.18);
    const bladeMat = new THREE.MeshStandardMaterial({
      color: 0x2a2e32,
      metalness: 0.4,
      roughness: 0.55,
      transparent: true,
      opacity: 0.85,
    });
    for (let i = 0; i < 3; i++) {
      const hold = new THREE.Group();
      hold.rotation.z = (i * Math.PI * 2) / 3;
      const blade = new THREE.Mesh(bladeGeo, bladeMat.clone());
      blade.position.x = radius * 0.42;
      hold.add(blade);
      hub.add(hold);
    }

    root.add(hub);
    return hub;
  }
}
