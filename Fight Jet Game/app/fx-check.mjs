// Lokaler FX-Check: startet dist/ via vite preview, prüft pro Jet:
// - Düsen-Glühen (Afterburner) von hinten
// - Kanonen-Tracer aus den Mündungen
// - Gegner nutzen Katalog-Assets & fliegen (AI-States)
import puppeteer from 'puppeteer';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const OUT = fileURLToPath(new URL('./shots/', import.meta.url));
fs.mkdirSync(OUT, { recursive: true });
const errors = [];

// vite preview starten
const preview = spawn('npx', ['vite', 'preview', '--port', '4173', '--strictPort'], {
  cwd: fileURLToPath(new URL('.', import.meta.url)),
  shell: true,
  stdio: 'ignore',
});
await new Promise((r) => setTimeout(r, 4000));

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1600, height: 900 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto('http://localhost:4173/', { waitUntil: 'networkidle0', timeout: 60000 });
await new Promise((r) => setTimeout(r, 4000));

const jets = ['f16', 'f35', 'elite'];
for (const jet of jets) {
  // Jet wählen und Spiel starten
  await page.evaluate(async (id) => {
    const g = window.__game;
    await g.startGame(id);
  }, jet);
  await new Promise((r) => setTimeout(r, 1500));

  // Nachbrenner an (Tab gedrückt halten) und Vollschub
  await page.keyboard.down('Tab');
  await page.keyboard.down('ShiftLeft');
  await new Promise((r) => setTimeout(r, 2500));
  await page.screenshot({ path: `${OUT}fx-${jet}-afterburner.png` });

  // Kanone feuern (Space) — mehrere Screenshots während der Salve
  await page.keyboard.down('Space');
  await new Promise((r) => setTimeout(r, 350));
  await page.screenshot({ path: `${OUT}fx-${jet}-cannon.png` });
  await page.keyboard.up('Space');
  await page.keyboard.up('Tab');
  await page.keyboard.up('ShiftLeft');

  // Gegner-Status auslesen
  const info = await page.evaluate(() => {
    const g = window.__game;
    return {
      playerJet: g.player.jetId,
      enemies: g.enemies.map((e) => ({
        jet: e.jetId,
        state: e.state,
        alive: e.alive,
        speed: Math.round(e.flight.speed),
        alt: Math.round(e.position.y),
        hasGlb: !!e.object.getObjectByName('glbJet'),
      })),
    };
  });
  console.log(`JET ${jet}:`, JSON.stringify(info, null, 1));
}

// Gegner-Beobachtung: 20 s warten, States/Positionen zweimal vergleichen
await page.evaluate(async () => { await window.__game.startGame('f16'); });
await new Promise((r) => setTimeout(r, 2000));
const snap1 = await page.evaluate(() =>
  window.__game.enemies.map((e) => ({ jet: e.jetId, state: e.state, p: e.position.toArray().map(Math.round), glb: !!e.object.getObjectByName('glbJet') }))
);
await new Promise((r) => setTimeout(r, 15000));
const snap2 = await page.evaluate(() =>
  window.__game.enemies.map((e) => ({ jet: e.jetId, state: e.state, p: e.position.toArray().map(Math.round), glb: !!e.object.getObjectByName('glbJet') }))
);
console.log('ENEMIES t=2s :', JSON.stringify(snap1));
console.log('ENEMIES t=17s:', JSON.stringify(snap2));
await page.screenshot({ path: `${OUT}fx-enemies.png` });

console.log('Fehler:', errors.length ? errors : 'KEINE');
await browser.close();
preview.kill();
process.exit(errors.length ? 1 : 0);
