// Visual check: GLB ground vehicles (SAM site + AAA truck) in-game.
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
const clickBtn = (txt) => page.evaluate((t) => {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent?.includes(t));
  b?.click();
  return !!b;
}, txt);
const clickCard = (txt) => page.evaluate((t) => {
  const c = [...document.querySelectorAll('[role="button"], button, .mission-card')].find(
    (x) => x.textContent?.includes(t)
  );
  c?.click();
  return !!c;
}, txt);
const waitState = async (want, timeout = 60000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const s = await page.evaluate(() => window.__game?.getState());
    if (s === want) return true;
    await sleep(500);
  }
  return false;
};

await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded', timeout: 45000 });
await sleep(9000);
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('fightjet3d.settings.v1') || '{}');
  s.campaignUnlockedMax = 5;
  s.ownedJets = ['f16','su25','l39','f35','f14','su34','su57','elite'];
  localStorage.setItem('fightjet3d.settings.v1', JSON.stringify(s));
});
await page.reload({ waitUntil: 'domcontentloaded' });
await sleep(8000);
await clickBtn('Campaign');
await sleep(1200);
await clickCard('IRON CURTAIN'); // Level 3 = SEAD, Glacier map
await sleep(1000);
console.log('launch:', await clickBtn('Launch mission'));
console.log('playing:', await waitState('playing'));
await sleep(1500);

// SAM + AAA exakt vor den Spieler setzen, auf Terrainhöhe
await page.evaluate(() => {
  const g = window.__game;
  const fwd = g.player.forward.clone();
  const base = g.player.object.position;
  for (const s of g.sams) {
    const p = base.clone().addScaledVector(fwd, 700);
    p.y = g.heightField.getHeight(p.x, p.z);
    s.object.position.copy(p);
  }
  let i = 0;
  for (const a of g.aaaUnits) {
    const p = base.clone().addScaledVector(fwd, 450 + i * 160);
    p.x += 40 + i * 40;
    p.y = g.heightField.getHeight(p.x, p.z);
    a.object.position.copy(p);
    i++;
  }
  // Spieler auf ~200m AGL, leicht nach unten gerichtet via Pitch
  const g2 = g.heightField.getHeight(base.x, base.z);
  g.player.object.position.y = g2 + 220;
});
await sleep(900);
await page.screenshot({ path: OUT + 'ground-1.png' });
await sleep(1200);
await page.screenshot({ path: OUT + 'ground-2.png' });
await sleep(1500);
await page.screenshot({ path: OUT + 'ground-3.png' });
const info = await page.evaluate(() => ({
  sams: window.__game?.sams?.length,
  aaa: window.__game?.aaaUnits?.length,
  // GLB attached? Kind-Namen prüfen
  sChildren: window.__game?.sams?.[0]?.object?.children?.map(c => c.name || c.type),
  aChildren: window.__game?.aaaUnits?.[0]?.object?.children?.map(c => c.name || c.type),
}));
console.log('units:', JSON.stringify(info));

console.log('=== ERRORS (' + errors.length + ') ===');
errors.slice(0, 20).forEach((e) => console.log('  ', e.slice(0, 200)));
await browser.close();
