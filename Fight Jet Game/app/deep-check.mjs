// Deep-Check: Menü, Hangar, Kampagne+Briefing, Maps, Gameplay, Debrief, Konsole, Screenshots.
import puppeteer from 'puppeteer';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('./shots-deep/', import.meta.url));
fs.mkdirSync(OUT, { recursive: true });

const errors = [];
const warnings = [];

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1600,900', '--mute-audio'],
  defaultViewport: { width: 1600, height: 900 },
});
const page = await browser.newPage();
page.on('console', (m) => {
  const t = m.text();
  if (m.type() === 'error') errors.push(t);
  if (m.type() === 'warning' && !t.includes('DevTools')) warnings.push(t);
});
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('requestfailed', (r) => errors.push('REQFAIL: ' + r.url() + ' ' + r.failure()?.errorText));

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

console.log('1) Menü laden...');
await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded', timeout: 45000 });
await sleep(9000);
await page.screenshot({ path: OUT + '01-menu.png' });
console.log('   Menu text:', (await page.evaluate(() => document.body.innerText.slice(0, 160))).replace(/\n+/g, ' | '));

console.log('2) Hangar...');
await clickBtn('Hangar');
await sleep(3500);
await page.screenshot({ path: OUT + '02-hangar.png' });

console.log('3) Campaign + Briefing...');
await clickBtn('Campaign');
await sleep(1500);
await page.screenshot({ path: OUT + '03-campaign.png' });
// Mission card → Briefing-Modal
console.log('   Briefing open:', await clickCard('OPERATION FIRST FLIGHT'));
await sleep(1000);
await page.screenshot({ path: OUT + '03b-briefing.png' });
// Launch aus Briefing
console.log('   Launch clicked:', await clickBtn('Launch mission'));
await sleep(12000); // lädt Mission 1
await page.screenshot({ path: OUT + '06-ingame.png' });
let st = await page.evaluate(() => ({
  state: window.__game?.getState(),
  enemies: window.__game?.enemies?.length,
  aaa: window.__game?.aaaUnits?.length,
}));
console.log('   In-game:', JSON.stringify(st));

console.log('4) Manöver + Kanone...');
await page.keyboard.down('ShiftLeft');
await page.keyboard.down('KeyS');
await sleep(1500);
await page.keyboard.up('KeyS');
await page.keyboard.down('KeyD');
await sleep(800);
await page.keyboard.up('KeyD');
await page.keyboard.down('Space');
await sleep(1000);
await page.keyboard.up('Space');
await page.screenshot({ path: OUT + '07-fire.png' });
const st2 = await page.evaluate(() => ({
  state: window.__game?.getState(),
  ammo: window.__game?.player?.ammo,
}));
console.log('   State:', JSON.stringify(st2));

console.log('5) Pause + Restart-Button...');
await page.keyboard.up('ShiftLeft');
await page.keyboard.press('KeyP');
await sleep(900);
await page.screenshot({ path: OUT + '08-pause.png' });
console.log('   state:', await page.evaluate(() => window.__game?.getState()));
console.log('   Restart-Button da:', await clickBtn('Restart sortie'));
await sleep(1500);
console.log('   nach Restart:', await page.evaluate(() => window.__game?.getState()));
await sleep(1000);

console.log('6) Victory-Debrief erzwingen (letzte Welle)...');
await page.evaluate(() => {
  const g = window.__game;
  g.debugGotoWave(2); // letzte Welle von Level 1
});
await sleep(2500);
// alle Gegner + Bodenziele killen → Victory
await page.evaluate(() => {
  const g = window.__game;
  for (const e of g.enemies) e.takeDamage(9999);
  for (const s of g.sams) s.takeDamage(9999);
  for (const a of g.aaaUnits) a.takeDamage(9999);
});
await sleep(5500); // waveDelay 3.2s → victory
await page.screenshot({ path: OUT + '10-victory.png' });
console.log('   state:', await page.evaluate(() => window.__game?.getState()));
console.log('   localStorage:', await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('fightjet3d.settings.v1') || '{}');
  return JSON.stringify({
    credits: s.aeroCredits, sorties: s.totalSorties, vic: s.totalVictories,
    bestL1: s.bestScorePerLevel?.['op-first-flight'], done: s.completedCampaignLevels,
  });
}));

console.log('7) Debrief → Command...');
await clickBtn('Command');
await sleep(2000);
await page.screenshot({ path: OUT + '09-backmenu.png' });
console.log('   state:', await page.evaluate(() => window.__game?.getState()));

console.log('8) Theater + Map-Thumbs (Kartenbilder)...');
await clickBtn('Theater');
await sleep(1500);
await page.screenshot({ path: OUT + '04-maps.png' });

console.log('\n=== ERRORS (' + errors.length + ') ===');
errors.slice(0, 30).forEach((e) => console.log('  ', e.slice(0, 300)));
console.log('=== WARNINGS (' + warnings.length + ') ===');
warnings.slice(0, 15).forEach((e) => console.log('  ', e.slice(0, 200)));

await browser.close();
process.exit(errors.length ? 1 : 0);
