import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { MapDef } from './MapCatalog';
import { MIN_MAP_SPAN_M } from './MapCatalog';

/** Gemeinsame Höhe-API für Spieler, KI und SAMs */
export interface HeightField {
  readonly size: number;
  getHeight(x: number, z: number): number;
}

export interface LoadedGlbMap {
  group: THREE.Group;
  size: number;
  heights: Float32Array;
  segments: number;
  minY: number;
  maxY: number;
  rawSpan: number;
  scaledSpan: number;
}

/**
 * Lädt eine große GLB-Karte, skaliert sie auf Spielgröße und backt ein
 * Höhenraster für Kollisionen.
 */
export async function loadGlbMap(def: MapDef): Promise<LoadedGlbMap> {
  if (!def.modelUrl) throw new Error(`Map ${def.id} has no modelUrl`);

  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(def.modelUrl);
  const root = gltf.scene;

  root.traverse((obj) => {
    if ((obj as THREE.Light).isLight) {
      obj.parent?.remove(obj);
      return;
    }
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.frustumCulled = true;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        if (!m) continue;
        const std = m as THREE.MeshStandardMaterial;
        if ('envMapIntensity' in std) std.envMapIntensity = 0.45;
        if ('metalness' in std && std.metalness > 0.9) std.metalness = 0.5;
        if ('roughness' in std && std.roughness < 0.12) std.roughness = 0.28;
        if ('map' in std && std.map == null) std.map = null;
        std.needsUpdate = true;
      }
    }
  });

  const wrap = new THREE.Group();
  wrap.name = `map_${def.id}`;
  wrap.add(root);

  let box = new THREE.Box3().setFromObject(wrap);
  let size = box.getSize(new THREE.Vector3());
  const rawSpan = Math.max(size.x, size.z);

  if (rawSpan < MIN_MAP_SPAN_M) {
    throw new Error(
      `Map ${def.id} zu klein (Span ${rawSpan.toFixed(0)} m < ${MIN_MAP_SPAN_M} m)`
    );
  }

  let center = box.getCenter(new THREE.Vector3());
  root.position.sub(center);
  root.position.y += size.y / 2;
  wrap.updateMatrixWorld(true);

  box = new THREE.Box3().setFromObject(wrap);
  size = box.getSize(new THREE.Vector3());
  const horiz = Math.max(size.x, size.z);
  const sXZ = def.targetSpanM / Math.max(horiz, 1);
  const sY = def.nonUniformScale ? def.heightScale : sXZ * def.heightScale;

  wrap.scale.set(sXZ, sY, sXZ);
  wrap.updateMatrixWorld(true);

  box = new THREE.Box3().setFromObject(wrap);
  center = box.getCenter(new THREE.Vector3());
  wrap.position.x -= center.x;
  wrap.position.z -= center.z;
  wrap.position.y -= box.min.y;
  wrap.updateMatrixWorld(true);

  box = new THREE.Box3().setFromObject(wrap);
  size = box.getSize(new THREE.Vector3());
  const scaledSpan = Math.max(size.x, size.z);
  const worldSize = def.worldSizeM;

  const mode = def.heightMode ?? 'raycast';
  const segments = mode === 'ground-plane' ? 8 : 64;
  const heights =
    mode === 'ground-plane'
      ? bakeFlatHeights(segments, Math.max(5, box.min.y + 2))
      : await bakeHeightGrid(wrap, worldSize, segments, box.max.y + 800);

  return {
    group: wrap,
    size: worldSize,
    heights,
    segments,
    minY: box.min.y,
    maxY: box.max.y,
    rawSpan,
    scaledSpan,
  };
}

function bakeFlatHeights(segments: number, groundY: number): Float32Array {
  const n = segments + 1;
  const heights = new Float32Array(n * n);
  heights.fill(groundY);
  return heights;
}

async function bakeHeightGrid(
  root: THREE.Object3D,
  worldSize: number,
  segments: number,
  rayStartY: number
): Promise<Float32Array> {
  const meshes: THREE.Mesh[] = [];
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
  });

  const raycaster = new THREE.Raycaster();
  raycaster.far = Math.max(20000, rayStartY + 20000);
  const origin = new THREE.Vector3();
  const dir = new THREE.Vector3(0, -1, 0);
  const half = worldSize / 2;
  const n = segments + 1;
  const heights = new Float32Array(n * n);
  const step = worldSize / segments;
  const FALLBACK = 20;

  for (let iz = 0; iz < n; iz++) {
    for (let ix = 0; ix < n; ix++) {
      const x = -half + ix * step;
      const z = -half + iz * step;
      origin.set(x, rayStartY, z);
      raycaster.set(origin, dir);
      const hits = raycaster.intersectObjects(meshes, false);
      heights[iz * n + ix] = hits.length > 0 ? hits[0].point.y : FALLBACK;
    }
    if (iz % 4 === 0) {
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  return heights;
}

/** HeightField aus gebackenem Raster */
export class GlbMapTerrain implements HeightField {
  readonly group: THREE.Group;
  readonly size: number;
  private heights: Float32Array;
  private seg: number;

  constructor(loaded: LoadedGlbMap) {
    this.group = loaded.group;
    this.size = loaded.size;
    this.heights = loaded.heights;
    this.seg = loaded.segments;
  }

  getHeight(x: number, z: number): number {
    const half = this.size / 2;
    if (x < -half || x > half || z < -half || z > half) return 20;
    const gx = ((x + half) / this.size) * this.seg;
    const gz = ((z + half) / this.size) * this.seg;
    const x0 = Math.min(Math.floor(gx), this.seg - 1);
    const z0 = Math.min(Math.floor(gz), this.seg - 1);
    const fx = gx - x0;
    const fz = gz - z0;
    const row = this.seg + 1;
    const h00 = this.heights[z0 * row + x0];
    const h10 = this.heights[z0 * row + x0 + 1];
    const h01 = this.heights[(z0 + 1) * row + x0];
    const h11 = this.heights[(z0 + 1) * row + x0 + 1];
    return h00 * (1 - fx) * (1 - fz) + h10 * fx * (1 - fz) + h01 * (1 - fx) * fz + h11 * fx * fz;
  }

  dispose() {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.geometry?.dispose();
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const mat of mats) mat?.dispose?.();
      }
    });
  }
}
