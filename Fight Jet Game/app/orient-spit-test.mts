import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import fs from 'node:fs';
import path from 'node:path';

// Node polyfill for GLTFLoader image paths
(globalThis as unknown as { self: typeof globalThis }).self = globalThis;

// Inline a simplified load using parseAsync from buffer (node-safe)
async function loadRaw(file: string) {
  const buf = fs.readFileSync(file);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const loader = new GLTFLoader();
  return loader.parseAsync(ab as ArrayBuffer, '');
}

function flattenSceneMeshes(scene: THREE.Object3D): THREE.Group {
  scene.updateMatrixWorld(true);
  const flat = new THREE.Group();
  type Entry = { obj: THREE.Object3D; vol: number };
  const entries: Entry[] = [];
  const tmpBox = new THREE.Box3();
  scene.traverse((obj) => {
    if (!(obj as THREE.Mesh).isMesh || !obj.visible) return;
    tmpBox.setFromObject(obj);
    if (tmpBox.isEmpty()) return;
    const s = tmpBox.getSize(new THREE.Vector3());
    const vol = Math.max(s.x, 0.001) * Math.max(s.y, 0.001) * Math.max(s.z, 0.001);
    entries.push({ obj, vol });
  });
  if (!entries.length) {
    flat.add(scene);
    return flat;
  }
  const vols = entries.map((e) => e.vol).sort((a, b) => a - b);
  const median = vols[Math.floor(vols.length / 2)] || 1;
  const use = entries.filter((e) => e.vol <= median * 25 + 1e-6);
  for (const { obj } of use.length ? use : entries) {
    const clone = obj.clone(false) as THREE.Mesh;
    if ((obj as THREE.Mesh).isMesh) {
      clone.geometry = (obj as THREE.Mesh).geometry;
      clone.material = (obj as THREE.Mesh).material;
    }
    obj.matrixWorld.decompose(clone.position, clone.quaternion, clone.scale);
    flat.add(clone);
  }
  return flat;
}

function align(
  wrap: THREE.Group,
  root: THREE.Object3D,
  orient: {
    yawDeg?: number;
    pitchDeg?: number;
    rollDeg?: number;
    skipDefaultYawFlip?: boolean;
    lengthIsLargest?: boolean;
  }
) {
  wrap.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(wrap);
  let size = box.getSize(new THREE.Vector3());
  const dims = [
    { axis: 0 as const, s: size.x },
    { axis: 1 as const, s: size.y },
    { axis: 2 as const, s: size.z },
  ].sort((a, b) => a.s - b.s);
  const heightAxis = dims[0].axis;
  if (heightAxis === 0) root.rotateZ(Math.PI / 2);
  else if (heightAxis === 2) root.rotateX(-Math.PI / 2);

  wrap.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(wrap);
  size = box.getSize(new THREE.Vector3());
  if (orient.lengthIsLargest) {
    if (size.x > size.z * 1.08) root.rotateY(-Math.PI / 2);
  } else if (size.z > size.x * 1.08) {
    root.rotateY(Math.PI / 2);
  }

  if (!orient.skipDefaultYawFlip) root.rotateY(Math.PI);

  if (orient.yawDeg) root.rotateY(THREE.MathUtils.degToRad(orient.yawDeg));
  if (orient.pitchDeg) root.rotateX(THREE.MathUtils.degToRad(orient.pitchDeg));
  if (orient.rollDeg) root.rotateZ(THREE.MathUtils.degToRad(orient.rollDeg));

  wrap.updateMatrixWorld(true);
  const c = new THREE.Box3().setFromObject(wrap).getCenter(new THREE.Vector3());
  root.position.sub(c);
}

function score(group: THREE.Group) {
  const box = new THREE.Box3().setFromObject(group);
  const size = box.getSize(new THREE.Vector3());
  let lY = 0,
    lN = 0,
    rY = 0,
    rN = 0;
  const v = new THREE.Vector3();
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry?.attributes?.position) return;
    const pos = mesh.geometry.attributes.position;
    const step = Math.max(1, Math.floor(pos.count / 800));
    for (let i = 0; i < pos.count; i += step) {
      v.fromBufferAttribute(pos, i);
      mesh.localToWorld(v);
      group.worldToLocal(v);
      if (v.x < -size.x * 0.3) {
        lY += v.y;
        lN++;
      }
      if (v.x > size.x * 0.3) {
        rY += v.y;
        rN++;
      }
    }
  });
  const wingDy = lN && rN ? Math.abs(lY / lN - rY / rN) : 99;
  return {
    size: { x: +size.x.toFixed(2), y: +size.y.toFixed(2), z: +size.z.toFixed(2) },
    wingDy: +wingDy.toFixed(3),
    spanOk: size.x > size.y * 1.15,
    lenOk: size.z > 4 && size.z < 18,
    score:
      (size.x > size.y * 1.15 ? 8 : 0) +
      (size.z > 4 && size.z < 18 ? 8 : 0) +
      (size.x > 6 ? 4 : 0) -
      wingDy * 5 -
      (size.z > 25 ? 30 : 0) -
      (size.y > size.x ? 10 : 0),
  };
}

const combos = [
  {},
  { skipDefaultYawFlip: true },
  { rollDeg: 90 },
  { rollDeg: -90 },
  { pitchDeg: 90 },
  { pitchDeg: -90 },
  { rollDeg: 90, yawDeg: 180 },
  { rollDeg: -90, yawDeg: 180 },
  { pitchDeg: -90, skipDefaultYawFlip: true },
  { pitchDeg: 90, skipDefaultYawFlip: true },
  { rollDeg: 180 },
  { pitchDeg: -90, rollDeg: 90 },
  { pitchDeg: -90, rollDeg: -90 },
  { pitchDeg: 90, rollDeg: 90 },
  { pitchDeg: 90, rollDeg: -90 },
  { yawDeg: 90 },
  { yawDeg: -90 },
  // raw: no auto height, only manual
];

const file = path.resolve('public/models/spitfire.glb');
const gltf = await loadRaw(file);
const out: unknown[] = [];

for (const orient of combos) {
  const raw = gltf.scene.clone(true);
  const root = flattenSceneMeshes(raw);
  const wrap = new THREE.Group();
  wrap.add(root);
  let box = new THREE.Box3().setFromObject(wrap);
  let size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  root.position.sub(center);
  box = new THREE.Box3().setFromObject(wrap);
  size = box.getSize(new THREE.Vector3());
  const longest = Math.max(size.x, size.y, size.z);
  wrap.scale.setScalar(9.1 / Math.max(longest, 0.001));
  align(wrap, root, orient as never);
  const s = score(wrap);
  const row = { orient, ...s };
  out.push(row);
  console.log(JSON.stringify(row));
}

(out as { score: number }[]).sort((a, b) => b.score - a.score);
fs.writeFileSync('orient-spit-report.json', JSON.stringify(out, null, 2));
console.log('BEST', JSON.stringify(out[0], null, 2));
