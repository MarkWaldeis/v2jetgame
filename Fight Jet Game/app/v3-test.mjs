// V3-Test: realistisches F-16, Chase-Boresight, Kanone nach vorne
import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('./shots/', import.meta.url));
fs.mkdirSync(OUT, { recursive: true });
const shot = (name) => path.join(OUT, name);

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1600, height: 900 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(process.env.FIGHT_JET_URL || 'http://127.0.0.1:3000/', {
  waitUntil: 'networkidle0',
  timeout: 30000,
});
await new Promise((r) => setTimeout(r, 2500));

console.log('1) Start + Chase von hinten...');
await page.keyboard.press('Enter');
await new Promise((r) => setTimeout(r, 2000));
await page.evaluate(() => {
  const g = window.__game;
  g.player.flight.speed = 210;
  g.player.flight.throttle = 0.75;
  g.player.object.quaternion.identity();
  g.player.object.position.set(0, 900, 3000);
  g.cam.mode = 'chase';
  g.cam.snapBehind(g.player.object);
});
await new Promise((r) => setTimeout(r, 900));
await page.screenshot({ path: shot('v3-01-chase-rear.png') });

console.log('2) Seitenansicht...');
await page.evaluate(() => {
  const g = window.__game;
  const p = g.player.position;
  const cam = g.engine.camera;
  cam.position.set(p.x + 18, p.y + 3, p.z + 2);
  cam.up.set(0, 1, 0);
  cam.lookAt(p.x, p.y, p.z);
  cam.updateMatrixWorld(true);
  g.engine.render();
});
await page.screenshot({ path: shot('v3-02-side.png') });

console.log('3) Heck-Nahaufnahme (3/4)...');
await page.evaluate(() => {
  const g = window.__game;
  const p = g.player.position;
  const cam = g.engine.camera;
  cam.position.set(p.x + 8, p.y + 4.5, p.z + 16);
  cam.up.set(0, 1, 0);
  cam.lookAt(p.x, p.y + 0.3, p.z);
  cam.updateMatrixWorld(true);
  g.engine.render();
});
await page.screenshot({ path: shot('v3-03-rear-close.png') });

console.log('4) Front 3/4 (Nase/Radome/Intake)...');
await page.evaluate(() => {
  const g = window.__game;
  const p = g.player.position;
  const cam = g.engine.camera;
  cam.position.set(p.x - 5, p.y + 2.5, p.z - 14);
  cam.up.set(0, 1, 0);
  cam.lookAt(p.x, p.y, p.z);
  cam.updateMatrixWorld(true);
  g.engine.render();
});
await page.screenshot({ path: shot('v3-04-front.png') });

console.log('5) Chase + Kanone...');
await page.evaluate(() => {
  const g = window.__game;
  g.cam.mode = 'chase';
  g.cam.snapBehind(g.player.object);
  g.player.flight.speed = 230;
});
await new Promise((r) => setTimeout(r, 600));
for (let i = 0; i < 10; i++) {
  await page.keyboard.down('Space');
  await new Promise((r) => setTimeout(r, 35));
  await page.keyboard.up('Space');
  await new Promise((r) => setTimeout(r, 25));
}
await page.screenshot({ path: shot('v3-05-cannon.png') });

console.log('6) Cockpit...');
await page.keyboard.press('KeyC');
await new Promise((r) => setTimeout(r, 1000));
await page.screenshot({ path: shot('v3-06-cockpit.png') });

const ori = await page.evaluate(() => {
  const g = window.__game;
  const f = g.player.forward;
  // Kamera-Forward in Three.js: local -Z → world via matrixWorld column 2
  const e = g.engine.camera.matrixWorld.elements;
  // column 2 of world matrix is camera +Z; forward is -column2
  const cx = -e[8], cy = -e[9], cz = -e[10];
  const len = Math.hypot(cx, cy, cz) || 1;
  return {
    jetFwd: { x: +f.x.toFixed(3), y: +f.y.toFixed(3), z: +f.z.toFixed(3) },
    camFwd: { x: +(cx / len).toFixed(3), y: +(cy / len).toFixed(3), z: +(cz / len).toFixed(3) },
    camMode: g.cam.mode,
    // Dot product should be ~1 if aligned
    align: +((f.x * cx + f.y * cy + f.z * cz) / len).toFixed(3),
  };
});
console.log('orientation', JSON.stringify(ori, null, 2));
if (errors.length) console.log('errors', errors);
else console.log('no page errors');

await browser.close();
console.log('done');
