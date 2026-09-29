// Verifiziert: TO BATTLE = Quick-Play-Skirmish, KEIN Campaign-Level/Rewards.
import puppeteer from 'puppeteer';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('./shots-deep/', import.meta.url));
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
const waitState = async (want, timeout = 60000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const s = await page.evaluate(() => window.__game?.getState());
    if (s === want) return true;
    await sleep(400);
  }
  return false;
};

// Frischer Storage → completedCampaignLevels muss LEER bleiben
await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded', timeout: 45000 });
await sleep(9000);
await page.evaluate(() => localStorage.removeItem('fightjet3d.settings.v1'));
await page.reload({ waitUntil: 'domcontentloaded' });
await sleep(8000);

// Vor einer Campaign-Mission simulieren: Level 3 via Campaign spielen wäre der Bug-Kontext.
// Hier erstmal direkt TO BATTLE ohne jede Campaign-Interaktion:
console.log('1) TO BATTLE klicken...');
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent?.includes('TO BATTLE'));
  b?.click();
});
console.log('   playing:', await waitState('playing', 90000));
const w = await page.evaluate(() => ({
  level: window.__game?.getCampaignLevelId?.() ?? null,
  waves: window.__game?.getActiveWaves?.().map((x) => x.label) ?? 'n/a',
}));
console.log('   levelId:', JSON.stringify(w.level), '| waves:', JSON.stringify(w.waves));
await page.screenshot({ path: OUT + 'quickplay-ingame.png' });

// Schnell-Sieg erzwingen → darf KEINE Campaign-Rewards geben
console.log('2) Quick-Play-Sieg erzwingen...');
await page.evaluate(() => { window.__game.debugGotoWave(2); });
await sleep(2000);
await page.evaluate(() => {
  const g = window.__game;
  for (const e of g.enemies) e.takeDamage(9999);
  for (const s of g.sams) s.takeDamage(9999);
  for (const a of g.aaaUnits) a.takeDamage(9999);
});
console.log('   victory:', await waitState('victory', 30000));
await sleep(1500);
await page.screenshot({ path: OUT + 'quickplay-debrief.png' });
const st = await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('fightjet3d.settings.v1') || '{}');
  return {
    credits: s.aeroCredits,
    completed: s.completedCampaignLevels ?? [],
    unlockedMax: s.campaignUnlockedMax,
    sorties: s.totalSorties,
    bestPerLevel: s.bestScorePerLevel ?? {},
    best: s.bestScore,
  };
});
console.log('   localStorage:', JSON.stringify(st));
const debriefText = await page.evaluate(() => document.body.innerText.slice(0, 500));
console.log('   debrief:', debriefText.replace(/\n+/g, ' | ').slice(0, 300));

console.log('\n=== ERRORS (' + errors.length + ') ===');
errors.slice(0, 20).forEach((e) => console.log('  ', e.slice(0, 250)));
await browser.close();
process.exit(errors.length ? 1 : 0);
