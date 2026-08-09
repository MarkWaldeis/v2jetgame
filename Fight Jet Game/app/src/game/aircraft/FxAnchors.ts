import * as THREE from 'three';

/** Ankerpunkte im lokalen Raum des Aircraft-Objekts (Nase −Z, Heck +Z). */
export interface FxAnchors {
  nozzles: THREE.Vector3[];
  muzzles: THREE.Vector3[];
  /** Raketen-Hardpoints (Wingtip / Underwing) */
  hardpoints: THREE.Vector3[];
  wingHalfSpan: number;
  nozzleScale: number;
  /** Gemessener Düsenradius (für EngineFx-Skala) */
  nozzleRadii?: number[];
}

export type ExhaustDetectOpts = {
  twinNozzles?: boolean;
  twinMuzzles?: boolean;
  /**
   * Katalog-Hinweis: grobe Düsenpositionen (nur Fallback / Twin-Count).
   * Finale Platzierung kommt aus Geometrie, sofern messbar.
   */
  catalogNozzles?: THREE.Vector3[];
  catalogNozzleScale?: number;
};

/**
 * Misst Bounding-Box + Exhaust-Öffnungen des Visuals im lokalen Raum von `parent`.
 * Düsen-FX wird **in** die Auspufföffnung gesetzt (eingezogen), nicht davor/darüber.
 */
export function computeFxAnchors(
  visual: THREE.Object3D,
  parent: THREE.Object3D,
  opts: ExhaustDetectOpts = {}
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

  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;
  for (const c of corners) {
    c.applyMatrix4(inv);
    minX = Math.min(minX, c.x);
    maxX = Math.max(maxX, c.x);
    minY = Math.min(minY, c.y);
    maxY = Math.max(maxY, c.y);
    minZ = Math.min(minZ, c.z);
    maxZ = Math.max(maxZ, c.z);
  }

  const length = Math.max(0.1, maxZ - minZ);
  const width = Math.max(0.1, maxX - minX);
  const height = Math.max(0.1, maxY - minY);
  const midY = (minY + maxY) * 0.5;

  const twinN =
    opts.twinNozzles ??
    ((opts.catalogNozzles?.length ?? 0) >= 2 || width > length * 0.52);
  const twinM = opts.twinMuzzles ?? twinN;

  // ── Exhaust-Öffnungen aus Geometrie (primär) ──
  const exhaust = detectExhaustNozzles(visual, parent, {
    twin: !!twinN,
    minX,
    maxX,
    minY,
    maxY,
    minZ,
    maxZ,
    length,
    width,
    height,
    midY,
  });

  let nozzles = exhaust.positions;
  let nozzleRadii = exhaust.radii;
  let nozzleScale = exhaust.scale;

  // Fallback: Katalog oder AABB-Heuristik
  if (nozzles.length === 0) {
    const aftZ = maxZ - length * 0.02;
    const nozzleY = minY + height * 0.34;
    const nx = width * 0.12;
    nozzles = twinN
      ? [new THREE.Vector3(-nx, nozzleY, aftZ), new THREE.Vector3(nx, nozzleY, aftZ)]
      : [new THREE.Vector3(0, nozzleY, aftZ)];
    // Leicht ins Rohr ziehen
    for (const n of nozzles) n.z -= length * 0.012;
    nozzleRadii = nozzles.map(() => THREE.MathUtils.clamp(width * 0.045, 0.18, 0.45));
    nozzleScale = THREE.MathUtils.clamp(width / 11, 0.55, 1.25);
  }

  // Katalog-Bias: Twin-X stark vom Katalog (kalibrierte Düse-Mitte),
  // Y/Z weiter Geometrie (Heck-Öffnung / Höhe)
  if (opts.catalogNozzles?.length && nozzles.length === opts.catalogNozzles.length) {
    for (let i = 0; i < nozzles.length; i++) {
      const cat = opts.catalogNozzles[i];
      if (twinN) {
        // Katalog-Spacing ist pro Jet abgestimmt — Geometrie oft zu weit außen
        nozzles[i].x = cat.x * 0.9 + nozzles[i].x * 0.1;
      } else {
        nozzles[i].x = 0;
      }
      // Y: Katalog oft besser (Düsenachse), leichte Geometrie-Mischung
      nozzles[i].y = nozzles[i].y * 0.45 + cat.y * 0.55;
      // Z: Geometrie (im Rohr) dominiert
      nozzles[i].z = nozzles[i].z * 0.88 + cat.z * 0.12;
    }
  }
  if (opts.catalogNozzleScale) {
    nozzleScale = THREE.MathUtils.clamp(
      nozzleScale * 0.55 + opts.catalogNozzleScale * 0.45,
      0.4,
      1.45
    );
  }

  // Mündungen (Bug)
  const noseZ = minZ + length * 0.06;
  const muzzleY = midY + height * 0.02;
  const mx = width * 0.07;
  const muzzles = twinM
    ? [new THREE.Vector3(-mx, muzzleY, noseZ), new THREE.Vector3(mx, muzzleY, noseZ)]
    : [new THREE.Vector3(-mx * 0.6, muzzleY, noseZ)];

  // Hardpoints (unverändert sinnvoll — Flügel-Unterseite)
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
      parent.worldToLocal(vWing);
      if (Math.abs(vWing.x) > width * 0.28 && Math.abs(vWing.x) < width * 0.49) {
        wingZSum += vWing.z;
        wingSampleN++;
        if (vWing.y < wingYMin) wingYMin = vWing.y;
      }
    }
  });
  const wingZRaw =
    wingSampleN > 10 ? wingZSum / wingSampleN : minZ + length * 0.38;
  const wingZ = THREE.MathUtils.clamp(
    wingZRaw * 0.55 + (minZ + length * 0.42) * 0.45,
    minZ + length * 0.28,
    maxZ - length * 0.22
  );

  const tipX = width * 0.4;
  const midX = width * 0.3;
  const innerX = width * 0.2;
  const bellyX = width * 0.1;
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
  const hangClearance = THREE.MathUtils.clamp(width * 0.018, 0.12, 0.28);
  const hardpoints = hpCandidates.map((hp) => {
    const skinY = sampleWingSkinY(visual, parent, hp.x, hp.z, width * 0.12, midY);
    const fallbackY =
      Number.isFinite(wingYMin) && wingYMin < midY
        ? wingYMin
        : midY - height * (0.12 + (Math.abs(hp.x) / width) * 0.22);
    const y = (skinY ?? fallbackY) - hangClearance;
    return new THREE.Vector3(hp.x, y, hp.z);
  });
  for (let i = 0; i + 1 < hardpoints.length; i += 2) {
    const L = hardpoints[i];
    const R = hardpoints[i + 1];
    const y = Math.min(L.y, R.y);
    const z = (L.z + R.z) * 0.5;
    L.y = y;
    R.y = y;
    L.z = z;
    R.z = z;
    const ax = (Math.abs(L.x) + Math.abs(R.x)) * 0.5;
    L.x = -ax;
    R.x = ax;
  }

  return {
    nozzles,
    muzzles,
    hardpoints,
    wingHalfSpan: width * 0.48,
    nozzleScale,
    nozzleRadii,
  };
}

/**
 * Findet 1–2 Exhaust-Öffnungen am Heck (+Z):
 * - Vertices im hinteren Band sammeln
 * - Twin: Cluster nach X (links/rechts)
 * - Ring-Radius schätzen, Zentrum = Öffnungsmitte
 * - Z leicht nach vorne (−Z-Richtung) inset → FX sitzt **im** Rohr
 */
function detectExhaustNozzles(
  visual: THREE.Object3D,
  parent: THREE.Object3D,
  b: {
    twin: boolean;
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
    length: number;
    width: number;
    height: number;
    midY: number;
  }
): { positions: THREE.Vector3[]; radii: number[]; scale: number } {
  const aftBandStart = b.maxZ - b.length * 0.12;
  const deepAft = b.maxZ - b.length * 0.05;
  const pts: THREE.Vector3[] = [];
  const named: THREE.Vector3[] = [];
  const v = new THREE.Vector3();
  const nameRe = /nozzle|exhaust|engine|afterburn|thrust|jetpipe|tailpipe|reheat|duct|petal/i;
  // Düsengürtel: nicht Flügelspitzen / Seitenleitwerk
  const yLo = b.midY - b.height * 0.38;
  const yHi = b.midY + b.height * 0.06;
  const maxLat = b.width * (b.twin ? 0.26 : 0.16);

  visual.traverse((obj) => {
    if (obj.name && nameRe.test(obj.name)) {
      obj.getWorldPosition(v);
      parent.worldToLocal(v);
      if (v.z > b.minZ + b.length * 0.45 && Math.abs(v.x) < maxLat) named.push(v.clone());
    }
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry?.attributes?.position || !mesh.visible) return;
    const pos = mesh.geometry.attributes.position;
    const step = Math.max(1, Math.floor(pos.count / 2200));
    for (let i = 0; i < pos.count; i += step) {
      v.fromBufferAttribute(pos, i);
      mesh.localToWorld(v);
      parent.worldToLocal(v);
      if (v.z < aftBandStart) continue;
      if (v.y < yLo || v.y > yHi) continue;
      if (Math.abs(v.x) > maxLat) continue;
      pts.push(v.clone());
    }
  });

  if (pts.length < 12 && named.length < 2) {
    return { positions: [], radii: [], scale: 1 };
  }

  // Bevorzugt tiefes Heck für Öffnungsebene
  const deep = pts.filter((p) => p.z >= deepAft);
  const pool = deep.length >= 20 ? deep : pts;

  type Cluster = { pts: THREE.Vector3[] };
  let clusters: Cluster[] = [];

  if (b.twin) {
    const left = pool.filter((p) => p.x < -b.width * 0.02);
    const right = pool.filter((p) => p.x > b.width * 0.02);
    // Falls unbalanciert: k-means lite auf X
    if (left.length < 8 || right.length < 8) {
      clusters = kMeans2XY(pool);
    } else {
      clusters = [{ pts: left }, { pts: right }];
      // Sort L then R
      clusters.sort((a, b) => meanX(a.pts) - meanX(b.pts));
    }
  } else {
    // Single: zentrale Punkte (|x| klein)
    const core = pool.filter((p) => Math.abs(p.x) < b.width * 0.18);
    clusters = [{ pts: core.length >= 10 ? core : pool }];
  }

  // Named mesh hints: pull cluster centers if nearby
  if (named.length) {
    for (const n of named) {
      let best = -1;
      let bestD = Infinity;
      for (let i = 0; i < clusters.length; i++) {
        const c = clusterCentroid(clusters[i].pts);
        const d = Math.hypot(c.x - n.x, c.y - n.y);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      if (best >= 0 && bestD < b.width * 0.25) {
        clusters[best].pts.push(n);
      }
    }
  }

  const positions: THREE.Vector3[] = [];
  const radii: number[] = [];

  for (const cl of clusters) {
    if (cl.pts.length < 6) continue;
    const center = findExhaustCenter(cl.pts);
    if (!center) continue;
    positions.push(center.pos);
    radii.push(center.radius);
  }

  // Twin-Symmetrie erzwingen
  if (b.twin && positions.length >= 2) {
    positions.sort((a, c) => a.x - c.x);
    const L = positions[0];
    const R = positions[positions.length - 1];
    let ax = (Math.abs(L.x) + Math.abs(R.x)) * 0.5;
    // Twin-Spacing in Metern (Arcade-Jets): nicht Flügel/Leitwerk
    ax = THREE.MathUtils.clamp(ax, 0.4, 1.35);
    const y = (L.y + R.y) * 0.5;
    const z = (L.z + R.z) * 0.5;
    L.x = -ax;
    R.x = ax;
    L.y = y;
    R.y = y;
    L.z = z;
    R.z = z;
    positions.length = 0;
    positions.push(L, R);
    let r = ((radii[0] ?? 0.25) + (radii[radii.length - 1] ?? 0.25)) * 0.5;
    r = THREE.MathUtils.clamp(r, 0.15, 0.34);
    radii.length = 0;
    radii.push(r, r);
  } else {
    // Single: exakt auf Mittelebene
    const p = positions[0] ?? new THREE.Vector3(0, b.midY - b.height * 0.08, b.maxZ - b.length * 0.03);
    let r = radii[0] ?? 0.28;
    r = THREE.MathUtils.clamp(r, 0.15, 0.36);
    p.x = 0;
    positions.length = 0;
    radii.length = 0;
    positions.push(p);
    radii.push(r);
  }

  const avgR =
    radii.length > 0 ? radii.reduce((s, r) => s + r, 0) / radii.length : 0.28;
  const scale = THREE.MathUtils.clamp(avgR / 0.3, 0.5, 1.2);

  return { positions, radii, scale };
}

function meanX(pts: THREE.Vector3[]) {
  if (!pts.length) return 0;
  return pts.reduce((s, p) => s + p.x, 0) / pts.length;
}

function clusterCentroid(pts: THREE.Vector3[]) {
  const c = new THREE.Vector3();
  for (const p of pts) c.add(p);
  if (pts.length) c.multiplyScalar(1 / pts.length);
  return c;
}

function kMeans2XY(pts: THREE.Vector3[]): { pts: THREE.Vector3[] }[] {
  if (pts.length < 4) return [{ pts }];
  let c0 = new THREE.Vector3(-1, 0, 0);
  let c1 = new THREE.Vector3(1, 0, 0);
  // init from extremes
  let minPx = pts[0],
    maxPx = pts[0];
  for (const p of pts) {
    if (p.x < minPx.x) minPx = p;
    if (p.x > maxPx.x) maxPx = p;
  }
  c0 = minPx.clone();
  c1 = maxPx.clone();
  let a: THREE.Vector3[] = [];
  let b: THREE.Vector3[] = [];
  for (let iter = 0; iter < 8; iter++) {
    a = [];
    b = [];
    for (const p of pts) {
      const d0 = (p.x - c0.x) ** 2 + (p.y - c0.y) ** 2;
      const d1 = (p.x - c1.x) ** 2 + (p.y - c1.y) ** 2;
      (d0 <= d1 ? a : b).push(p);
    }
    if (a.length) c0 = clusterCentroid(a);
    if (b.length) c1 = clusterCentroid(b);
  }
  const out: { pts: THREE.Vector3[] }[] = [];
  if (a.length) out.push({ pts: a });
  if (b.length) out.push({ pts: b });
  out.sort((u, v) => meanX(u.pts) - meanX(v.pts));
  return out;
}

/**
 * Ring-Zentrum der Exhaust-Öffnung + Radius.
 * Nutzt hinteres Perzentil der Z-Werte und medianen XY-Radius.
 */
function findExhaustCenter(
  pts: THREE.Vector3[]
): { pos: THREE.Vector3; radius: number } | null {
  if (pts.length < 6) return null;

  // Hinterste 35 % der Cluster-Punkte = Öffnungsebene
  const byZ = [...pts].sort((a, b) => b.z - a.z);
  const nTake = Math.max(8, Math.floor(byZ.length * 0.35));
  const lip = byZ.slice(0, nTake);

  // Iteratives Ring-Zentrum (trim outliers)
  let cx = lip.reduce((s, p) => s + p.x, 0) / lip.length;
  let cy = lip.reduce((s, p) => s + p.y, 0) / lip.length;
  for (let k = 0; k < 4; k++) {
    const rs = lip.map((p) => Math.hypot(p.x - cx, p.y - cy));
    const med = median(rs);
    const keep = lip.filter((p) => Math.hypot(p.x - cx, p.y - cy) < med * 1.85 + 0.05);
    if (keep.length < 5) break;
    cx = keep.reduce((s, p) => s + p.x, 0) / keep.length;
    cy = keep.reduce((s, p) => s + p.y, 0) / keep.length;
  }

  const radList = lip.map((p) => Math.hypot(p.x - cx, p.y - cy)).sort((a, c) => a - c);
  // 55.–75. Perzentil ≈ Innenring der Öffnung (nicht Außenverkleidung)
  const lo = Math.floor(radList.length * 0.55);
  const hi = Math.min(radList.length - 1, Math.floor(radList.length * 0.75));
  let radius = 0;
  let rn = 0;
  for (let i = lo; i <= hi; i++) {
    radius += radList[i];
    rn++;
  }
  radius = rn ? radius / rn : median(radList);
  // Absolute Meter-Grenzen — klein genug fürs Rohr, nicht „außerhalb“
  radius = THREE.MathUtils.clamp(radius, 0.14, 0.36);
  if (!Number.isFinite(radius)) radius = 0.26;

  // Öffnungs-Z: 88. Perzentil, dann **ins Rohr** ziehen
  const zs = lip.map((p) => p.z).sort((a, c) => a - c);
  const zExit = zs[Math.min(zs.length - 1, Math.floor(zs.length * 0.88))];
  const inset = THREE.MathUtils.clamp(radius * 0.45, 0.1, 0.32);
  const zInside = zExit - inset;

  // Y leicht zur Mitte der Öffnung (nicht Rücken)
  const yInside = cy;

  return {
    pos: new THREE.Vector3(cx, yInside, zInside),
    radius,
  };
}

function median(arr: number[]) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) * 0.5;
}

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
      if (v.y > midY + 0.05) continue;
      samples.push(v.y);
    }
  });

  if (samples.length < 4) return null;
  samples.sort((a, b) => a - b);
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
