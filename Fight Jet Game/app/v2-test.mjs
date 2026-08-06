// V2-Test: detailliertes Modell, Cockpit, Missions-Wellen, SAM-Stellungen.
import puppeteer from 'puppeteer';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('./shots/', import.meta.url));
fs.mkdirSync(OUT, { recursive: true });
const errors = [];
const BASE = process.env.FIGHT_JET_URL || 'http://localhost:3000/';

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1600, height: 900 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 30000 });
await new Promise((r) => setTimeout(r, 3000));

console.log('1) Start...');
await page.keyboard.press('Enter');
await new Promise((r) => setTimeout(r, 2000));
const w1 = await page.evaluate(() => ({
  bandits: window.__game.enemies.filter((e) => e.alive).length,
  wave: window.__game.missionWaveIndex,
  text: document.body.innerText.match(/WELLE \d\/\d/)?.[0],
}));
console.log('   Welle 1:', JSON.stringify(w1));
await page.screenshot({ path: OUT + 'v2-01-wave1.png' });

console.log('2) Nahaufnahme Jet (Kamera dicht, 1 Frame einfrieren)...');
await page.evaluate(() => {
  const g = window.__game;
  g.player.flight.speed = 40;
  // Kamera-Controller kurz umgehen
  g.cam.mode = 'chase';
  const p = g.player.position;
  const cam = g.engine.camera;
  cam.position.set(p.x + 14, p.y + 4, p.z + 8);
  cam.up.set(0, 1, 0);
  cam.lookAt(p.x, p.y + 0.5, p.z);
  cam.updateMatrixWorld(true);
  // Einmal manuell rendern bevor cam.update greift
  g.engine.render();
});
await page.screenshot({ path: OUT + 'v2-02-jet-closeup.png' });

console.log('3) Cockpit-Interior...');
await page.keyboard.press('KeyC');
await new Promise((r) => setTimeout(r, 1200));
await page.screenshot({ path: OUT + 'v2-03-cockpit.png' });
await page.keyboard.press('KeyC');

console.log('4) Welle 1 clearen -> warte auf Welle 2...');
await page.evaluate(() => {
  window.__game.enemies.forEach((e) => { if (e.alive) e.takeDamage(9999); });
});
// waveDelay 3.5s + Puffer (rAF-Throttle in headless)
for (let i = 0; i < 20; i++) {
  await new Promise((r) => setTimeout(r, 500));
  const st = await page.evaluate(() => ({
    bandits: window.__game.enemies.filter((e) => e.alive).length,
    wave: window.__game.missionWaveIndex,
  }));
  if (st.wave >= 1 && st.bandits > 0) {
    console.log('   Nach Clear:', JSON.stringify(st));
    break;
  }
  if (i === 19) console.log('   Timeout Welle 2:', JSON.stringify(st));
}
await page.screenshot({ path: OUT + 'v2-04-wave2.png' });

console.log('5) Direkt zu Welle 3 (SEAD / SAMs)...');
await page.evaluate(() => window.__game.debugGotoWave(2));
await new Promise((r) => setTimeout(r, 1000));
const w3 = await page.evaluate(() => ({
  bandits: window.__game.enemies.filter((e) => e.alive).length,
  sams: window.__game.sams.filter((s) => s.alive).length,
  wave: window.__game.missionWaveIndex,
}));
console.log('   Welle 3:', JSON.stringify(w3));

console.log('6) SAM-Site Nahaufnahme + Beschuss-Test...');
await page.evaluate(() => {
  const g = window.__game;
  const THREE = window.__THREE; // optional
  const sam = g.sams.find((s) => s.alive);
  if (!sam) return false;
  // Spieler 500 m vor der SAM, Nase aufs Ziel
  const sx = sam.position.x, sy = sam.position.y, sz = sam.position.z;
  g.player.position.set(sx, sy + 180, sz + 550);
  g.player.object.position.copy(g.player.position);
  g.player.object.lookAt(sx, sy + 4, sz);
  // lookAt setzt -Z Richtung; Flight-Forward nutzt Quaternion
  g.player.flight.speed = 50;
  g.player.lockTarget = sam;
  g.player.lockProgress = 1;
  g.engine.camera.position.set(sx + 40, sy + 80, sz + 120);
  g.engine.camera.lookAt(sx, sy + 4, sz);
  g.engine.render();
  return true;
});
await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: OUT + 'v2-05-samsite.png' });

// Rakete mit erzwungenem Lock
await page.evaluate(() => {
  const g = window.__game;
  const sam = g.sams.find((s) => s.alive);
  if (!sam) return;
  g.player.lockTarget = sam;
  g.player.lockProgress = 1;
  g.player.missilesLeft = Math.max(1, g.player.missilesLeft);
});
await page.keyboard.press('KeyF');
let samsLeft = 4;
for (let i = 0; i < 12; i++) {
  await new Promise((r) => setTimeout(r, 350));
  samsLeft = await page.evaluate(() => window.__game.sams.filter((x) => x.alive).length);
  if (samsLeft < 4) break;
}
const res = await page.evaluate(() => ({
  samsLeft: window.__game.sams.filter((x) => x.alive).length,
  score: window.__game.player.score,
  missiles: window.__game.missiles.length,
}));
console.log('   Nach SAM-Rakete:', JSON.stringify(res));
await page.screenshot({ path: OUT + 'v2-06-samkill.png' });

const ok =
  w1.bandits === 3 &&
  w3.sams === 4 &&
  w3.wave === 2 &&
  errors.length === 0;

console.log('\n=== ERGEBNIS ===');
console.log('Konsolen-Fehler:', errors.length ? errors.slice(0, 8) : 'KEINE');
console.log('V2 OK:', ok ? 'JA' : 'NEIN (siehe Werte oben)');
await browser.close();
process.exit(ok ? 0 : 1);
