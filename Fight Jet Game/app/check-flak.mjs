// Flak-Visuals v5: Effekte deterministisch vor die Kamera spawnen + Screenshots.
// Anschluss: Terrain-Crash → Debrief muss „CRASHED“ + Hull 0% zeigen.
import puppeteer from 'puppeteer';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('./shots-ground/', import.meta.url));
fs.mkdirSync(OUT, { recursive: true });
const errors = [];
const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1600,900', '--mute-audio'],
  defaultViewport: { width: 1600, height: 900 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitState = async (want, timeout = 90000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const s = await page.evaluate(() => window.__game?.getState());
    if (s === want) return true;
    await sleep(400);
  }
  return false;
};

await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded', timeout: 45000 });
await sleep(9000);
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent?.includes('TO BATTLE'));
  b?.click();
});
console.log('playing:', await waitState('playing'));
await sleep(500);

// Spieler hoch über Terrain stellen, dann kontrolliert Effekte spawnen
await page.evaluate(() => {
  const g = window.__game;
  const ground = g.heightField.getHeight(g.player.object.position.x, g.player.object.position.z);
  g.player.object.position.y = ground + 600;
});
await sleep(300);
await page.evaluate(() => {
  const g = window.__game;
  const p = g.player.object.position;
  const fwd = g.player.forward.clone();
  // Tracer: von unten-vorne Richtung Jet — kreuzt das Sichtfeld der Chase-Cam
  const muzzle = p.clone().addScaledVector(fwd, 160);
  muzzle.y = p.y - 120;
  const aim = p.clone().addScaledVector(fwd, 40);
  for (let i = 0; i < 6; i++) g.effects.flakTracer(muzzle, aim);
  // Puff-Cluster direkt vor/um den Jet — im Kamerablick
  for (let i = 0; i < 6; i++) {
    const bp = p.clone().addScaledVector(fwd, 25 + i * 12);
    bp.x += (Math.random() - 0.5) * 30;
    bp.y += (Math.random() - 0.5) * 20;
    bp.z += (Math.random() - 0.5) * 10;
    g.effects.flakPuff(bp);
  }
});
await sleep(60);
await page.screenshot({ path: `${OUT}flak-fx1.png` });
await sleep(250);
await page.screenshot({ path: `${OUT}flak-fx2.png` });
await sleep(500);
await page.screenshot({ path: `${OUT}flak-fx3.png` });

// --- Crash-Debrief: Jet ins Terrain teleportieren → „CRASHED“, Hull 0% ---
await page.evaluate(() => {
  const g = window.__game;
  const ground = g.heightField.getHeight(g.player.object.position.x, g.player.object.position.z);
  g.player.object.position.y = ground - 5; // unter Terrain → Crash-Pfad
});
await sleep(1500);
const st = await page.evaluate(() => window.__game?.getState());
console.log('after crash state:', st);
await sleep(1500);
await page.screenshot({ path: `${OUT}crash-debrief.png` });
const debrief = await page.evaluate(() => document.body.innerText.slice(0, 1200));
console.log('--- DEBRIEF ---');
console.log(debrief.split('\n').slice(0, 30).join(' | '));

console.log('=== ERRORS (' + errors.length + ') ===');
errors.slice(0, 20).forEach((e) => console.log('  ', e.slice(0, 200)));
await browser.close();
