// Verifiziert: Düsen-FX am Heck, Tracer an Mündungen, Auto-Track bei Lock
import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const OUT = fileURLToPath(new URL('./shots/', import.meta.url));
fs.mkdirSync(OUT, { recursive: true });
const shot = (n) => path.join(OUT, n);

const preview = spawn('npx', ['vite', 'preview', '--host', '127.0.0.1', '--port', '4173', '--strictPort'], {
  cwd: fileURLToPath(new URL('.', import.meta.url)),
  shell: true,
  stdio: 'ignore',
});
await new Promise((r) => setTimeout(r, 4500));

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1600, height: 900 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle0', timeout: 60000 });
await new Promise((r) => setTimeout(r, 3500));

const jets = ['f16', 'f35', 'elite'];
for (const jet of jets) {
  await page.evaluate(async (id) => {
    await window.__game.startGame(id);
  }, jet);
  await new Promise((r) => setTimeout(r, 1200));

  // Stabilisieren + Anker loggen
  const anchors = await page.evaluate(() => {
    const g = window.__game;
    const p = g.player;
    p.object.quaternion.identity();
    p.object.position.set(0, 900, 3000);
    p.flight.speed = 220;
    g.cam.snapBehind(p.object);
    const muzzles = p.getMuzzles().map((v) => [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)]);
    const nozzles = (p.engineFx?.group?.children || [])
      .filter((c) => c.isGroup || c.type === 'Group')
      .map((c) => [+c.position.x.toFixed(2), +c.position.y.toFixed(2), +c.position.z.toFixed(2)]);
    return { jet: p.jetId, muzzles, nozzles, anchors: p.anchors ? {
      n: p.anchors.nozzles.map((v) => [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)]),
      m: p.anchors.muzzles.map((v) => [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)]),
    } : null };
  });
  console.log('anchors', JSON.stringify(anchors));

  // Afterburner von hinten
  await page.keyboard.down('Tab');
  await page.keyboard.down('ShiftLeft');
  await new Promise((r) => setTimeout(r, 1800));
  await page.screenshot({ path: shot(`v4-${jet}-ab.png`) });

  // Kanone
  for (let i = 0; i < 12; i++) {
    await page.keyboard.down('Space');
    await new Promise((r) => setTimeout(r, 30));
    await page.keyboard.up('Space');
    await new Promise((r) => setTimeout(r, 20));
  }
  await page.screenshot({ path: shot(`v4-${jet}-cannon.png`) });
  await page.keyboard.up('Tab');
  await page.keyboard.up('ShiftLeft');
}

// Auto-Track: Gegner vor den Spieler setzen + Lock erzwingen
await page.evaluate(async () => {
  await window.__game.startGame('f16');
});
await new Promise((r) => setTimeout(r, 1000));
const trackInfo = await page.evaluate(() => {
  const g = window.__game;
  const p = g.player;
  p.object.quaternion.identity();
  p.object.position.set(0, 900, 3000);
  // Ersten Gegner vor die Nase setzen
  const e = g.enemies.find((x) => x.alive) || g.enemies[0];
  if (!e) return { ok: false };
  e.alive = true;
  e.position.set(0, 900, 3000 - 800); // 800 m vor dem Spieler (−Z)
  e.object.position.copy(e.position);
  e.object.quaternion.identity();
  p.lockTarget = e;
  p.lockProgress = 1;
  g.cam.snapBehind(p.object);
  return {
    ok: true,
    enemy: e.position.toArray().map(Math.round),
    player: p.position.toArray().map(Math.round),
  };
});
console.log('track setup', trackInfo);
// ein paar Frames laufen lassen damit trackBlend hochgeht
await new Promise((r) => setTimeout(r, 1500));
const tracking = await page.evaluate(() => ({
  autoTrack: window.__game.cam.isTracking,
  lock: window.__game.player.lockProgress,
  name: window.__game.player.lockTarget?.name,
}));
console.log('tracking', tracking);
await page.screenshot({ path: shot('v4-autotrack.png') });

console.log('errors', errors.length ? errors : 'none');
await browser.close();
preview.kill();
process.exit(errors.length ? 1 : 0);
