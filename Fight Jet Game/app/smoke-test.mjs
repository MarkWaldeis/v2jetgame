// Headless Smoke-Test: öffnet das Spiel, prüft Konsole, macht Screenshots,
// simuliert Gameplay (Start, Steuerung, Feuern).
import puppeteer from 'puppeteer';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('./shots/', import.meta.url));
fs.mkdirSync(OUT, { recursive: true });

const errors = [];
const warnings = [];

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1600,900'],
  defaultViewport: { width: 1600, height: 900 },
});
const page = await browser.newPage();
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
  if (m.type() === 'warning') warnings.push(m.text());
});
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

console.log('1) Lade Seite...');
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle0', timeout: 30000 });
await new Promise(r => setTimeout(r, 4000));
await page.screenshot({ path: OUT + '01-menu.png' });
const menuVisible = await page.evaluate(() => document.body.innerText.includes('FIGHT JET 3D'));
console.log('   Menü sichtbar:', menuVisible);

console.log('2) Starte Spiel (Enter)...');
await page.keyboard.press('Enter');
await new Promise(r => setTimeout(r, 2500));
await page.screenshot({ path: OUT + '02-takeoff.png' });
const hudVisible = await page.evaluate(() => document.body.innerText.includes('KNOTS'));
console.log('   HUD sichtbar:', hudVisible);
// Debug: Kamera-Jet-Distanz & Sichtbarkeit
const camDebug = await page.evaluate(() => {
  const g = window.__game;
  const cam = g.engine.camera.position;
  const jet = g.player.position;
  return { dist: cam.distanceTo(jet).toFixed(1), jetY: jet.y.toFixed(0), camY: cam.y.toFixed(0), mode: g.cam?.mode ?? '?' };
});
console.log('   Kamera-Jet:', JSON.stringify(camDebug));

console.log('3) Steuerungstest: Steigflug + sanfte Rolle...');
await page.keyboard.down('ShiftLeft');
await page.keyboard.down('KeyW');
await new Promise(r => setTimeout(r, 2000));
await page.keyboard.up('KeyW');
await page.keyboard.down('KeyA');
await new Promise(r => setTimeout(r, 600));
await page.keyboard.up('KeyA');
await page.keyboard.down('KeyD');
await new Promise(r => setTimeout(r, 600));
await page.keyboard.up('KeyD');
await page.screenshot({ path: OUT + '03-maneuver.png' });
const aliveAfterManeuver = await page.evaluate(() => window.__game.player.alive);
console.log('   Spieler lebt nach Manöver:', aliveAfterManeuver);

console.log('4) Feuertest (Kanone)...');
await page.keyboard.down('Space');
await new Promise(r => setTimeout(r, 1200));
await page.keyboard.up('Space');
await page.screenshot({ path: OUT + '04-cannon.png' });

console.log('5) Steigflug mit AB, dann Cockpit-View...');
await page.keyboard.down('Tab');
await page.keyboard.down('KeyW');
await new Promise(r => setTimeout(r, 4000));
await page.keyboard.up('KeyW');
await page.keyboard.up('Tab');
await page.keyboard.up('ShiftLeft');
await page.keyboard.press('KeyC');
await new Promise(r => setTimeout(r, 1500));
await page.screenshot({ path: OUT + '05-cockpit.png' });
await page.keyboard.press('KeyC');
// Sicherheit: falls abgestürzt, neu starten
const aliveNow = await page.evaluate(() => window.__game.player.alive);
if (!aliveNow) {
  console.log('   Spieler abgestürzt — Neustart für Kampf-Test');
  await page.keyboard.press('Enter');
  await new Promise(r => setTimeout(r, 1500));
}

// Spieldaten aus dem DOM
const hudText = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 400));
console.log('   HUD-Text:', hudText);

console.log('6) Kampf-Test: Lock-On + Rakete auf Bandit...');
await page.keyboard.up('ShiftLeft');
const combat = await page.evaluate(() => {
  const g = window.__game;
  const e = g.enemies.find(x => x.alive);
  // Spieler direkt hinter den Feind setzen und auf ihn ausrichten
  const behind = e.position.clone().addScaledVector(e.forward, -400);
  g.player.position.copy(behind);
  g.player.position.y = e.position.y;
  g.player.object.lookAt(e.position); g.player.object.rotateY(Math.PI);
  g.player.flight.speed = 200;
  return { enemy: e.name, dist: g.player.position.distanceTo(e.position).toFixed(0) };
});
console.log('   Setup:', JSON.stringify(combat));
// Lock abwarten (max 4s)
let locked = false;
for (let i = 0; i < 20; i++) {
  await new Promise(r => setTimeout(r, 300));
  // Spieler klebt am Feind (Flugmodell bewegt ihn weiter) — neu ausrichten
  await page.evaluate(() => {
    const g = window.__game;
    const e = g.enemies.find(x => x.alive);
    if (!e) return;
    const behind = e.position.clone().addScaledVector(e.forward, -400);
    g.player.position.copy(behind);
    g.player.object.lookAt(e.position); g.player.object.rotateY(Math.PI);
    g.player.flight.speed = 200;
  });
  const lp = await page.evaluate(() => window.__game.player.lockProgress);
  if (lp >= 1) { locked = true; break; }
}
console.log('   Lock erreicht:', locked);
await page.screenshot({ path: OUT + '06-lock.png' });
if (locked) {
  let fired = false;
  for (let attempt = 0; attempt < 4 && !fired; attempt++) {
    // direkt vor dem Schuss neu positionieren + Lock sicherstellen
    const ready = await page.evaluate(() => {
      const g = window.__game;
      const e = g.enemies.find(x => x.alive);
      if (!e) return false;
      const behind = e.position.clone().addScaledVector(e.forward, -400);
      g.player.position.copy(behind);
      g.player.object.lookAt(e.position); g.player.object.rotateY(Math.PI);
      g.player.flight.speed = e.flight.speed;
      return g.player.lockProgress >= 1 && g.player.lockTarget === e;
    });
    if (!ready) { await new Promise(r => setTimeout(r, 400)); continue; }
    await page.keyboard.press('KeyF');
    await new Promise(r => setTimeout(r, 300));
    fired = await page.evaluate(() => window.__game.player.missilesLeft < 6);
  }
  console.log('   Rakete abgefeuert:', fired);
  // Rakete fliegen lassen, Spieler weiter hinter Feind halten
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 400));
    await page.evaluate(() => {
      const g = window.__game;
      const e = g.enemies.find(x => x.alive);
      if (!e) return;
      const behind = e.position.clone().addScaledVector(e.forward, -400);
      g.player.position.copy(behind);
      g.player.object.lookAt(e.position); g.player.object.rotateY(Math.PI);
      g.player.flight.speed = 200;
    });
  }
  const result = await page.evaluate(() => ({
    score: window.__game.player.score,
    missiles: window.__game.player.missilesLeft,
    enemiesAlive: window.__game.enemies.filter(e => e.alive).length,
  }));
  console.log('   Nach Raketenschuss:', JSON.stringify(result));
  await page.screenshot({ path: OUT + '07-kill.png' });
}

// FPS-Messung (grob)
const fps = await page.evaluate(() => new Promise((res) => {
  let frames = 0;
  const start = performance.now();
  const count = () => { frames++; if (performance.now() - start < 2000) requestAnimationFrame(count); else res(frames / 2); };
  requestAnimationFrame(count);
}));
console.log('   FPS (headless/swiftshader):', fps);

console.log('\n=== ERGEBNIS ===');
console.log('Konsolen-Fehler:', errors.length ? errors.slice(0, 10) : 'KEINE');
console.log('Screenshots in:', OUT);
await browser.close();
process.exit(errors.length ? 1 : 0);
