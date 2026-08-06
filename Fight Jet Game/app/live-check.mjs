// Live-Check: lädt die GitHub-Pages-Version, prüft Konsole & Spielstart.
import puppeteer from 'puppeteer';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('./shots/', import.meta.url));
fs.mkdirSync(OUT, { recursive: true });
const errors = [];

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1600, height: 900 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto('https://markwaldeis.github.io/fight-jet-3d/', { waitUntil: 'networkidle0', timeout: 60000 });
await new Promise(r => setTimeout(r, 5000));
const menu = await page.evaluate(() => document.body.innerText.toLowerCase().includes('fight jet 3d'));
await page.keyboard.press('Enter');
await new Promise(r => setTimeout(r, 2500));
const hud = await page.evaluate(() => document.body.innerText.includes('KNOTS'));
await page.screenshot({ path: OUT + '08-live.png' });
console.log('LIVE Menü:', menu, '| HUD nach Start:', hud, '| Fehler:', errors.length ? errors : 'KEINE');
await browser.close();
process.exit(menu && hud && !errors.length ? 0 : 1);
