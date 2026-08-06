// Probe spitfire mesh AABBs in browser after selectJet
import puppeteer from 'puppeteer';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const preview = spawn(
  process.execPath,
  [path.join(root, 'node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', '4196', '--strictPort'],
  { cwd: root, stdio: 'ignore' }
);
await new Promise((r) => setTimeout(r, 5000));
const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage();
await page.goto('http://127.0.0.1:4196/', { waitUntil: 'networkidle0', timeout: 120000 });
await new Promise((r) => setTimeout(r, 3000));

const info = await page.evaluate(async () => {
  const g = window.__game;
  await g.selectJet('spitfire');
  const meshes = [];
  g.player.object.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    // local geo bbox
    o.geometry.computeBoundingBox();
    const bb = o.geometry.boundingBox;
    const sx = bb.max.x - bb.min.x;
    const sy = bb.max.y - bb.min.y;
    const sz = bb.max.z - bb.min.z;
    // world aabb
    o.updateMatrixWorld(true);
    const wb = new (g.player.object.position.constructor)(0, 0, 0); // dummy
    // use three Box3 via mesh
    const box = { min: { x: Infinity, y: Infinity, z: Infinity }, max: { x: -Infinity, y: -Infinity, z: -Infinity } };
    const pos = o.geometry.attributes.position;
    const v = g.player.object.position.clone().set(0, 0, 0);
    const step = Math.max(1, Math.floor(pos.count / 500));
    for (let i = 0; i < pos.count; i += step) {
      v.fromBufferAttribute(pos, i);
      o.localToWorld(v);
      g.player.object.worldToLocal(v);
      box.min.x = Math.min(box.min.x, v.x);
      box.min.y = Math.min(box.min.y, v.y);
      box.min.z = Math.min(box.min.z, v.z);
      box.max.x = Math.max(box.max.x, v.x);
      box.max.y = Math.max(box.max.y, v.y);
      box.max.z = Math.max(box.max.z, v.z);
    }
    meshes.push({
      name: o.name,
      verts: pos.count,
      geoSize: { x: +sx.toFixed(2), y: +sy.toFixed(2), z: +sz.toFixed(2) },
      localSize: {
        x: +(box.max.x - box.min.x).toFixed(2),
        y: +(box.max.y - box.min.y).toFixed(2),
        z: +(box.max.z - box.min.z).toFixed(2),
      },
      localZ: { min: +box.min.z.toFixed(2), max: +box.max.z.toFixed(2) },
    });
  });
  return meshes;
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
preview.kill();
