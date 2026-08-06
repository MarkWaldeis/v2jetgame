// Visueller Smoke-Test: alle Katalog-Jets laden, AB + Chase screenshot
import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = fileURLToPath(new URL('.', import.meta.url));
const OUT = path.join(root, 'shots');
fs.mkdirSync(OUT, { recursive: true });

const preview = spawn('npx', ['vite', 'preview', '--host', '127.0.0.1', '--port', '4175', '--strictPort'], {
  cwd: root, shell: true, stdio: 'ignore',
});
await new Promise((r) => setTimeout(r, 5000));

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1600, height: 900 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto('http://127.0.0.1:4175/', { waitUntil: 'networkidle0', timeout: 90000 });
await new Promise((r) => setTimeout(r, 4000));

const catalog = await page.evaluate(() => {
  // access via game after import not easy — hardcode from known list
  return ['f16', 'f35', 'f14', 'l39', 'elite', 'su25', 'su34', 'su57'];
});

const report = [];
for (const id of catalog) {
  const t0 = Date.now();
  let ok = true;
  let err = null;
  let info = null;
  try {
    info = await page.evaluate(async (jetId) => {
      const g = window.__game;
      await g.startGame(jetId);
      // wait a bit for visual
      await new Promise((r) => setTimeout(r, 400));
      const p = g.player;
      p.object.quaternion.identity();
      p.object.position.set(0, 900, 3000);
      p.flight.speed = 180;
      g.cam.snapBehind(p.object);
      const muzzles = p.getMuzzles?.()?.map((v) => [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)]) ?? [];
      const hasGlb = !!p.object.getObjectByName('glbJet');
      const kids = p.object.children.length;
      return {
        jetId: p.jetId,
        name: p.loadout?.name,
        faction: p.loadout?.faction,
        hasGlb,
        kids,
        muzzles,
        speedMult: p.flight.speedMult,
      };
    }, id);
    await page.keyboard.down('Tab');
    await new Promise((r) => setTimeout(r, 1200));
    await page.screenshot({ path: path.join(OUT, `hangar-${id}.png`) });
    await page.keyboard.up('Tab');
  } catch (e) {
    ok = false;
    err = String(e?.message || e);
  }
  report.push({ id, ok, err, ms: Date.now() - t0, info });
  console.log(id, ok ? 'OK' : 'FAIL', JSON.stringify(info || err));
}

await browser.close();
preview.kill();
fs.writeFileSync(path.join(root, 'hangar-test-report.json'), JSON.stringify(report, null, 2));
const fails = report.filter((r) => !r.ok || !r.info?.hasGlb);
console.log('FAILS', fails.length ? fails : 'none');
console.log('PAGEERRORS', errors.length ? errors : 'none');
process.exit(fails.length || errors.length ? 1 : 0);
