import * as THREE from 'three';
import { JET_CATALOG, type JetId } from '../game/aircraft/JetCatalog';
import { loadJetGlb } from '../game/aircraft/GlbJetLoader';

const cache = new Map<JetId, string>();
const inflight = new Map<JetId, Promise<string>>();

/** Render a single jet GLB to a data-URL thumbnail (cached). */
export async function getJetThumbnail(jetId: JetId, size = 320): Promise<string> {
  const hit = cache.get(jetId);
  if (hit) return hit;
  const pending = inflight.get(jetId);
  if (pending) return pending;

  const job = renderThumb(jetId, size)
    .then((url) => {
      cache.set(jetId, url);
      inflight.delete(jetId);
      return url;
    })
    .catch((err) => {
      inflight.delete(jetId);
      throw err;
    });
  inflight.set(jetId, job);
  return job;
}

/** Warm cache for a list of jets (sequential to avoid GPU thrash). */
export async function warmJetThumbnails(ids: JetId[], size = 280): Promise<void> {
  for (const id of ids) {
    if (cache.has(id)) continue;
    try {
      await getJetThumbnail(id, size);
    } catch (e) {
      console.warn('[jetThumbnails] failed', id, e);
    }
  }
}

export function peekJetThumbnail(jetId: JetId): string | null {
  return cache.get(jetId) ?? null;
}

async function renderThumb(jetId: JetId, size: number): Promise<string> {
  const def = JET_CATALOG.find((j) => j.id === jetId) ?? JET_CATALOG[0];
  const loaded = await loadJetGlb(def.modelUrl, {
    orient: {
      lengthIsLargest: def.era === 'modern' || def.era === 'early_jet',
      ...def.modelOrient,
    },
    targetLength: def.physics.modelLengthM ?? 15.5,
  });

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  });
  renderer.setSize(size, size, false);
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.setClearColor(0x000000, 0);

  scene.add(new THREE.HemisphereLight(0xd0d8c0, 0x1a1810, 0.7));
  const key = new THREE.DirectionalLight(0xfff0d0, 1.4);
  key.position.set(6, 10, 5);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x88aa66, 0.5);
  fill.position.set(-8, 3, -4);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xc9a227, 0.6);
  rim.position.set(-1, 2, 10);
  scene.add(rim);

  const jet = loaded.group;
  const box = new THREE.Box3().setFromObject(jet);
  const size3 = box.getSize(new THREE.Vector3());
  jet.position.y = -box.min.y;
  jet.rotation.y = -0.55;
  scene.add(jet);

  const span = Math.max(size3.x, size3.y, size3.z);
  const dist = span * 1.55;
  camera.position.set(dist * 0.55, dist * 0.28, dist * 0.85);
  camera.lookAt(0, size3.y * 0.25, 0);

  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/png');

  // dispose
  jet.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.geometry?.dispose();
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      mats.forEach((mat) => mat?.dispose?.());
    }
  });
  renderer.dispose();

  return url;
}
