import * as THREE from 'three';

/** Ankerpunkte im lokalen Raum des Aircraft-Objekts (Nase −Z, Heck +Z). */
export interface FxAnchors {
  nozzles: THREE.Vector3[];
  muzzles: THREE.Vector3[];
  /** Raketen-Hardpoints (Wingtip / Underwing) */
  hardpoints: THREE.Vector3[];
  wingHalfSpan: number;
  nozzleScale: number;
}

/**
 * Misst die Bounding-Box des Visuals im lokalen Raum von `parent`
 * und leitet realistische Düsen- und Mündungspositionen ab.
 * So kleben FX am Modell, auch wenn Katalog-Werte ungenau sind.
 */
export function computeFxAnchors(
  visual: THREE.Object3D,
  parent: THREE.Object3D,
  opts: { twinNozzles?: boolean; twinMuzzles?: boolean } = {}
): FxAnchors {
  parent.updateMatrixWorld(true);
  visual.updateMatrixWorld(true);

  const worldBox = new THREE.Box3().setFromObject(visual);
  const inv = new THREE.Matrix4().copy(parent.matrixWorld).invert();

  const corners = [
    new THREE.Vector3(worldBox.min.x, worldBox.min.y, worldBox.min.z),
    new THREE.Vector3(worldBox.min.x, worldBox.min.y, worldBox.max.z),
    new THREE.Vector3(worldBox.min.x, worldBox.max.y, worldBox.min.z),
    new THREE.Vector3(worldBox.min.x, worldBox.max.y, worldBox.max.z),
    new THREE.Vector3(worldBox.max.x, worldBox.min.y, worldBox.min.z),
    new THREE.Vector3(worldBox.max.x, worldBox.min.y, worldBox.max.z),
    new THREE.Vector3(worldBox.max.x, worldBox.max.y, worldBox.min.z),
    new THREE.Vector3(worldBox.max.x, worldBox.max.y, worldBox.max.z),
  ];

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const c of corners) {
    c.applyMatrix4(inv);
    minX = Math.min(minX, c.x); maxX = Math.max(maxX, c.x);
    minY = Math.min(minY, c.y); maxY = Math.max(maxY, c.y);
    minZ = Math.min(minZ, c.z); maxZ = Math.max(maxZ, c.z);
  }

  const length = Math.max(0.1, maxZ - minZ);
  const width = Math.max(0.1, maxX - minX);
  const height = Math.max(0.1, maxY - minY);
  const midY = (minY + maxY) * 0.5;

  // Düse: am hinteren Ende (+Z), leicht unter der Rumpfmitte (typisch F-16/F-35)
  const aftZ = maxZ - length * 0.015;
  const nozzleY = minY + height * 0.36;
  // Mündung: vorne (−Z), etwas über der Mitte
  const noseZ = minZ + length * 0.06;
  const muzzleY = midY + height * 0.02;

  const twinN = opts.twinNozzles ?? width > length * 0.52;
  const twinM = opts.twinMuzzles ?? twinN;
  const nx = width * 0.11;
  const mx = width * 0.07;

  const nozzles = twinN
    ? [new THREE.Vector3(-nx, nozzleY, aftZ), new THREE.Vector3(nx, nozzleY, aftZ)]
    : [new THREE.Vector3(0, nozzleY, aftZ)];

  const muzzles = twinM
    ? [new THREE.Vector3(-mx, muzzleY, noseZ), new THREE.Vector3(mx, muzzleY, noseZ)]
    : [new THREE.Vector3(-mx * 0.6, muzzleY, noseZ)];

  // Hardpoints: immer UNTER den Flügeln (Wingtip / Mid / Inner / Belly).
  // X/Z in Aircraft-Lokalraum; Y = Flügel-Unterhaut − freier Abstand für Raketenkörper.
  // Sample wing Z from outer vertices (where |x| is large → wing)
  let wingZSum = 0;
  let wingSampleN = 0;
  let wingYMin = Infinity;
  const vWing = new THREE.Vector3();
  visual.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry?.attributes?.position || !mesh.visible) return;
    const pos = mesh.geometry.attributes.position;
    const step = Math.max(1, Math.floor(pos.count / 800));
    for (let i = 0; i < pos.count; i += step) {
      vWing.fromBufferAttribute(pos, i);
      mesh.localToWorld(vWing);
      // Aircraft-Lokalraum (parent), nicht Visual-Lokal — Visual hat oft Scale!
      parent.worldToLocal(vWing);
      if (Math.abs(vWing.x) > width * 0.28 && Math.abs(vWing.x) < width * 0.49) {
        wingZSum += vWing.z;
        wingSampleN++;
        if (vWing.y < wingYMin) wingYMin = vWing.y;
      }
    }
  });
  // Flügel-Chord-Mitte eher leicht vor der Rumpfmitte (typische Pylon-Lage)
  const wingZRaw =
    wingSampleN > 10 ? wingZSum / wingSampleN : minZ + length * 0.38;
  const wingZ = THREE.MathUtils.clamp(
    wingZRaw * 0.55 + (minZ + length * 0.42) * 0.45,
    minZ + length * 0.28,
    maxZ - length * 0.22
  );

  // Stationen: aussen → innen, L/R-Paare (für gerades Loadout)
  const tipX = width * 0.40;
  const midX = width * 0.30;
  const innerX = width * 0.20;
  const bellyX = width * 0.10;

  const hpCandidates = [
    { x: -tipX, z: wingZ - length * 0.04 },
    { x: tipX, z: wingZ - length * 0.04 },
    { x: -midX, z: wingZ },
    { x: midX, z: wingZ },
    { x: -innerX, z: wingZ + length * 0.03 },
    { x: innerX, z: wingZ + length * 0.03 },
    { x: -bellyX, z: wingZ + length * 0.06 },
    { x: bellyX, z: wingZ + length * 0.06 },
  ];

  // Raketenkörper-Radius-Abstand unter der Haut (Meter)
  const hangClearance = THREE.MathUtils.clamp(width * 0.018, 0.12, 0.28);

  const hardpoints = hpCandidates.map((hp) => {
    const skinY = sampleWingSkinY(visual, parent, hp.x, hp.z, width * 0.12, midY);
    // Fallback: gemessene Flügel-Unterseite bzw. Rumpfmitte − Anteil Höhe
    const fallbackY =
      Number.isFinite(wingYMin) && wingYMin < midY
        ? wingYMin
        : midY - height * (0.12 + (Math.abs(hp.x) / width) * 0.22);
    const y = (skinY ?? fallbackY) - hangClearance;
    return new THREE.Vector3(hp.x, y, hp.z);
  });

  // L/R-Paare auf gleiche Y/Z zwingen (asymmetrische Mesh-Samples, z. B. F-35)
  for (let i = 0; i + 1 < hardpoints.length; i += 2) {
    const L = hardpoints[i];
    const R = hardpoints[i + 1];
    const y = Math.min(L.y, R.y); // tieferer = sicher unter beiden Flügeln
    const z = (L.z + R.z) * 0.5;
    L.y = y;
    R.y = y;
    L.z = z;
    R.z = z;
    // Spiegel-X exakt
    const ax = (Math.abs(L.x) + Math.abs(R.x)) * 0.5;
    L.x = -ax;
    R.x = ax;
  }

  return {
    nozzles,
    muzzles,
    hardpoints,
    wingHalfSpan: width * 0.48,
    nozzleScale: THREE.MathUtils.clamp(width / 11, 0.55, 1.25),
  };
}

/**
 * Flügel-Unterhaut nahe (targetX, targetZ) in Aircraft-Lokalraum.
 * Nicht das absolute Y-Minimum (Pods/Einläufe), sondern das obere Band
 * der unteren Vertex-Wolke ≈ echte Flügelplatte.
 */
function sampleWingSkinY(
  visual: THREE.Object3D,
  parent: THREE.Object3D,
  targetX: number,
  targetZ: number,
  searchRadius: number,
  midY: number
): number | null {
  const samples: number[] = [];
  const v = new THREE.Vector3();

  visual.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry?.attributes?.position || !mesh.visible) return;
    const pos = mesh.geometry.attributes.position;
    const step = Math.max(1, Math.floor(pos.count / 1000));
    for (let i = 0; i < pos.count; i += step) {
      v.fromBufferAttribute(pos, i);
      mesh.localToWorld(v);
      parent.worldToLocal(v);

      const dx = v.x - targetX;
      const dz = v.z - targetZ;
      if (Math.abs(dx) > searchRadius || Math.abs(dz) > searchRadius * 1.6) continue;

      // Untere Hälfte — kein Rücken / Cockpit
      if (v.y > midY + 0.05) continue;

      samples.push(v.y);
    }
  });

  if (samples.length < 4) return null;
  samples.sort((a, b) => a - b);
  // 75.–85. Perzentil der unteren Wolke ≈ Unterseite der Flügelplatte
  // (0 % = tiefste Pods, 100 % = nahe Midline)
  const lo = Math.floor(samples.length * 0.72);
  const hi = Math.min(samples.length - 1, Math.floor(samples.length * 0.88));
  let sum = 0;
  let n = 0;
  for (let i = lo; i <= hi; i++) {
    sum += samples[i];
    n++;
  }
  return n ? sum / n : samples[lo];
}
