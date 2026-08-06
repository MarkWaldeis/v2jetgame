// Prüft Chase-Cam: hinter+über dem Jet, Fadenkreuz vor der Nase — alle Jets.
import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = fileURLToPath(new URL('.', import.meta.url));
const OUT = path.join(root, 'shots');
fs.mkdirSync(OUT, { recursive: true });

const preview = spawn(
  'npx',
  ['vite', 'preview', '--host', '127.0.0.1', '--port', '4176', '--strictPort'],
  { cwd: root, shell: true, stdio: 'ignore' }
);
await new Promise((r) => setTimeout(r, 5000));

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1600, height: 900 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto('http://127.0.0.1:4176/', { waitUntil: 'networkidle0', timeout: 90000 });
await new Promise((r) => setTimeout(r, 3500));

const jets = ['f16', 'f35', 'f14', 'l39', 'elite', 'su25', 'su34', 'su57'];
const report = [];

for (const id of jets) {
  await page.evaluate(async (jetId) => {
    await window.__game.startGame(jetId);
  }, id);
  await new Promise((r) => setTimeout(r, 1000));

  // Level flight
  const level = await page.evaluate(() => {
    const g = window.__game;
    const p = g.player;
    p.object.rotation.set(0, 0, 0);
    p.object.quaternion.identity();
    p.object.position.set(0, 900, 3000);
    p.flight.speed = 160;
    g.cam.mode = 'chase';
    g.cam.snapBehind(p.object);
    g.cam.update(0.05, p.object, p.flight.speed, g.engine.camera, undefined, null);
    g.engine.render();

    const cam = g.engine.camera;
    const jet = p.object.position;
    const c = cam.position;
    const fwd = p.forward;
    const toJet = { x: jet.x - c.x, y: jet.y - c.y, z: jet.z - c.z };
    const e = cam.matrixWorld.elements;
    // Three.js camera looks down local -Z
    let cx = -e[8], cy = -e[9], cz = -e[10];
    const clen = Math.hypot(cx, cy, cz) || 1;
    cx /= clen; cy /= clen; cz /= clen;
    const align = cx * fwd.x + cy * fwd.y + cz * fwd.z;
    const tlen = Math.hypot(toJet.x, toJet.y, toJet.z) || 1;
    const jetInFront = (toJet.x * fwd.x + toJet.y * fwd.y + toJet.z * fwd.z) / tlen;
    // Jet should project BELOW screen center (crosshair ahead of plane)
    // NDC y: project jet world pos
    const v = jet.clone().project(cam);
    return {
      jet: p.jetId,
      align: +align.toFixed(3),
      jetInFront: +jetInFront.toFixed(3),
      above: +(c.y - jet.y).toFixed(2),
      camUpY: +cam.up.y.toFixed(3),
      // ndcY < 0 means jet is below center → Fadenkreuz vor/über dem Flugzeug
      jetNdcY: +v.y.toFixed(3),
    };
  });
  await page.screenshot({ path: path.join(OUT, `cam-${id}-level.png`) });

  // Pitched up
  const pitched = await page.evaluate(() => {
    const g = window.__game;
    const p = g.player;
    p.object.rotation.set(-0.45, 0, 0);
    p.object.quaternion.setFromEuler(p.object.rotation);
    p.object.position.set(0, 900, 3000);
    g.cam.snapBehind(p.object);
    g.cam.update(0.05, p.object, 160, g.engine.camera, undefined, null);
    g.engine.render();
    const c = g.engine.camera.position;
    const jet = p.object.position;
    const fwd = p.forward;
    const e = g.engine.camera.matrixWorld.elements;
    let cx = -e[8], cy = -e[9], cz = -e[10];
    const clen = Math.hypot(cx, cy, cz) || 1;
    cx /= clen; cy /= clen; cz /= clen;
    const align = cx * fwd.x + cy * fwd.y + cz * fwd.z;
    return {
      align: +align.toFixed(3),
      camY: +c.y.toFixed(1),
      jetY: +jet.y.toFixed(1),
      fwdY: +fwd.y.toFixed(3),
      above: +(c.y - jet.y).toFixed(2),
    };
  });
  await page.screenshot({ path: path.join(OUT, `cam-${id}-pitch.png`) });

  // Rolled — camera up.y should stay reasonably high (no full roll-follow)
  const rolled = await page.evaluate(() => {
    const g = window.__game;
    const p = g.player;
    p.object.rotation.set(0, 0, 1.0);
    p.object.quaternion.setFromEuler(p.object.rotation);
    p.object.position.set(0, 900, 3000);
    g.cam.snapBehind(p.object);
    g.cam.update(0.05, p.object, 160, g.engine.camera, undefined, null);
    g.engine.render();
    return { camUpY: +g.engine.camera.up.y.toFixed(3) };
  });
  await page.screenshot({ path: path.join(OUT, `cam-${id}-roll.png`) });

  // jetNdcY < 0 → Jet unter Bildschirmmitte → Fadenkreuz vor dem Flugzeug
  const ok =
    level.align > 0.9 &&
    level.jetInFront > 0.4 &&
    level.above > 2.0 &&
    level.jetNdcY < -0.02 &&
    pitched.align > 0.7 &&
    // leichte Bank-Mitnahme erlaubt, aber kein Voll-Mitrollen
    rolled.camUpY > 0.55;

  report.push({ id, ok, level, pitched, rolled });
  console.log(id, ok ? 'OK' : 'CHECK', JSON.stringify({ level, pitched, rolled }));
}

await browser.close();
preview.kill();
fs.writeFileSync(path.join(root, 'cam-check-report.json'), JSON.stringify(report, null, 2));
const fails = report.filter((r) => !r.ok);
console.log('FAILS', fails.length ? fails.map((f) => f.id) : 'none');
console.log('errors', errors.length ? errors : 'none');
process.exit(fails.length || errors.length ? 1 : 0);
