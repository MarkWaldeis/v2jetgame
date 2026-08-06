// Orientierungs-Diagnose für Legacy-Jets: Side/Rear/Top-Screenshots + Maße
import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = fileURLToPath(new URL('.', import.meta.url));
const OUT = path.join(root, 'shots');
fs.mkdirSync(OUT, { recursive: true });

const preview = spawn(
  process.execPath,
  [path.join(root, 'node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', '4195', '--strictPort'],
  { cwd: root, stdio: 'ignore' }
);
await new Promise((r) => setTimeout(r, 5000));

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1400, height: 800 },
});
const page = await browser.newPage();
await page.goto('http://127.0.0.1:4195/', { waitUntil: 'networkidle0', timeout: 120000 });
await new Promise((r) => setTimeout(r, 3500));

const jets = ['f16', 'f35', 'f14', 'l39', 'su25', 'su34', 'su57', 'p51', 'p40', 'spitfire', 'mig3', 'mig15'];
const report = [];

for (const id of jets) {
  const info = await page.evaluate(async (jetId) => {
    const g = window.__game;
    await g.selectJet(jetId);
    await g.startGame(jetId);
    const p = g.player;
    p.object.rotation.set(0, 0, 0);
    p.object.quaternion.identity();
    p.object.position.set(0, 900, 3000);
    p.flight.snapVelocityToNose();
    p.flight.speed = 120;

    // Find glb visual
    let visual = null;
    p.object.traverse((o) => {
      if (o.name === 'glbJet') visual = o;
    });
    if (!visual) visual = p.object.children[0];

    // Build local AABB in aircraft object space via mesh vertices
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    let meshCount = 0;
    visual.traverse((o) => {
      if (!o.isMesh || !o.geometry?.attributes?.position) return;
      meshCount++;
      const pos = o.geometry.attributes.position;
      const step = Math.max(1, Math.floor(pos.count / 1500));
      const v = { x: 0, y: 0, z: 0 };
      // Use three's vector via temporary Object3D methods on existing vectors
      const tmp = p.object.position.clone().set(0, 0, 0);
      for (let i = 0; i < pos.count; i += step) {
        tmp.fromBufferAttribute(pos, i);
        o.localToWorld(tmp);
        p.object.worldToLocal(tmp);
        minX = Math.min(minX, tmp.x); maxX = Math.max(maxX, tmp.x);
        minY = Math.min(minY, tmp.y); maxY = Math.max(maxY, tmp.y);
        minZ = Math.min(minZ, tmp.z); maxZ = Math.max(maxZ, tmp.z);
      }
    });

    const ex = maxX - minX;
    const ey = maxY - minY;
    const ez = maxZ - minZ;
    const muzzles = p.getMuzzles();
    const mx = muzzles.reduce((s, m) => s + m.x, 0) / Math.max(1, muzzles.length);
    const my = muzzles.reduce((s, m) => s + m.y, 0) / Math.max(1, muzzles.length);
    const mz = muzzles.reduce((s, m) => s + m.z, 0) / Math.max(1, muzzles.length);
    const fwd = p.forward;

    // Centering check: BBox center should be (0,0,0) within 0.05m
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const cz = (minZ + maxZ) / 2;
    const centered = Math.abs(cx) < 0.05 && Math.abs(cy) < 0.05 && Math.abs(cz) < 0.05;

    return {
      id: jetId,
      meshCount,
      extent: { x: +ex.toFixed(2), y: +ey.toFixed(2), z: +ez.toFixed(2) },
      zRange: { min: +minZ.toFixed(2), max: +maxZ.toFixed(2) },
      yRange: { min: +minY.toFixed(2), max: +maxY.toFixed(2) },
      xRange: { min: +minX.toFixed(2), max: +maxX.toFixed(2) },
      // Centering: BBox center must be at (0,0,0)
      bboxCenter: { x: +cx.toFixed(4), y: +cy.toFixed(4), z: +cz.toFixed(4) },
      centered,
      // Correct: X (span) largest or ~equal, Y (height) smallest, nose at min Z
      okSpanOnX: ex >= ez * 0.85,
      okHeightSmallest: ey <= ex * 0.75 && ey <= ez * 0.85,
      okNoseNegZ: minZ < -Math.abs(maxZ) * 0.55,
      muzzle: { x: +mx.toFixed(2), y: +my.toFixed(2), z: +mz.toFixed(2) },
      forward: { x: +fwd.x.toFixed(3), y: +fwd.y.toFixed(3), z: +fwd.z.toFixed(3) },
      visualSpan: p.visualSpan,
      visualLength: p.visualLength,
    };
  }, id);

  // Freeze orientation + flight so torque/update don't bank the plane
  await page.evaluate(() => {
    const g = window.__game;
    const p = g.player;
    p.object.quaternion.identity();
    p.object.rotation.set(0, 0, 0);
    p.object.position.set(0, 900, 3000);
    p.flight.snapVelocityToNose();
    p.flight.throttle = 0.5;
    p.flight.physics.torqueRoll = 0;
    p.flight.physics.pFactorYaw = 0;
    p.flutter?.reset?.();
  });

  // Rear chase
  await page.evaluate(() => {
    const g = window.__game;
    const p = g.player;
    p.object.quaternion.identity();
    p.object.position.set(0, 900, 3000);
    g.cam.mode = 'chase';
    g.cam.snapBehind(p.object);
    for (let i = 0; i < 20; i++) {
      p.object.quaternion.identity();
      g.cam.update(0.05, p.object, 120, g.engine.camera, undefined, null, {
        freeLookHeld: false,
        gForce: 1,
        afterburner: false,
        firing: false,
        stalled: false,
        airbrake: false,
        camFit: p.camFit,
      });
    }
    p.object.quaternion.identity();
    g.engine.render();
  });
  await page.screenshot({ path: path.join(OUT, `orient-${id}-rear.png`) });

  // Side view (+X): nose should point left (−Z)
  await page.evaluate(() => {
    const g = window.__game;
    const p = g.player;
    p.object.quaternion.identity();
    p.object.position.set(0, 900, 3000);
    const cam = g.engine.camera;
    cam.position.set(40, 905, 3000);
    cam.up.set(0, 1, 0);
    cam.lookAt(0, 900, 3000);
    cam.updateMatrixWorld(true);
    g.engine.render();
  });
  await page.screenshot({ path: path.join(OUT, `orient-${id}-side.png`) });

  // Top view: wings left-right, nose up in image (−Z)
  await page.evaluate(() => {
    const g = window.__game;
    const p = g.player;
    p.object.quaternion.identity();
    p.object.position.set(0, 900, 3000);
    const cam = g.engine.camera;
    cam.position.set(0, 945, 3000);
    cam.up.set(0, 0, -1);
    cam.lookAt(0, 900, 3000);
    cam.updateMatrixWorld(true);
    g.engine.render();
  });
  await page.screenshot({ path: path.join(OUT, `orient-${id}-top.png`) });

  report.push(info);
  console.log(JSON.stringify(info));
}

fs.writeFileSync(path.join(root, 'orient-check-report.json'), JSON.stringify(report, null, 2));
await browser.close();
preview.kill();
console.log('DONE shots in', OUT);
