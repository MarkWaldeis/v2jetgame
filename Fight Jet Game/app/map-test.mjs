// Testet Kartenwechsel, Größe und Kollisions-Höhen über die laufende Game-Instanz.
import puppeteer from 'puppeteer';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('.', import.meta.url));
const preview = spawn(
  'npx',
  ['vite', 'preview', '--host', '127.0.0.1', '--port', '4188', '--strictPort'],
  { cwd: root, shell: true, stdio: 'ignore' }
);
await new Promise((r) => setTimeout(r, 5000));

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1400, height: 900 },
  protocolTimeout: 300000,
});
const page = await browser.newPage();
page.setDefaultTimeout(300000);
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message || e)));
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text());
});

await page.goto('http://127.0.0.1:4188/', { waitUntil: 'networkidle0', timeout: 120000 });
await new Promise((r) => setTimeout(r, 2500));

const results = [];
for (const id of ['islands', 'glacier']) {
  const t0 = Date.now();
  const info = await page.evaluate(async (mapId) => {
    const g = window.__game;
    if (!g) return { ok: false, error: 'no __game' };
    try {
      await g.selectMap(mapId);
      const hf = g.heightField ?? g.proceduralTerrain;
      // private fields accessible at runtime
      const heightField = g.heightField || g.proceduralTerrain;
      const size = heightField.size;
      const samples = [];
      for (const [x, z] of [
        [0, 0],
        [1000, 1000],
        [-2000, 500],
        [0, 3000],
      ]) {
        samples.push({ x, z, h: +heightField.getHeight(x, z).toFixed(2) });
      }
      const playerY = g.player.position.y;
      const ground = heightField.getHeight(g.player.position.x, g.player.position.z);
      const glbVisible = !!g.glbMap?.group?.parent;
      const procVisible = g.proceduralTerrain?.mesh?.visible;
      return {
        ok: true,
        mapId: g.selectedMapId,
        size,
        samples,
        playerY: +playerY.toFixed(1),
        ground: +ground.toFixed(1),
        clearance: +(playerY - ground).toFixed(1),
        glbVisible,
        procVisible,
      };
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  }, id);
  results.push({ id, ms: Date.now() - t0, ...info });
  console.log(id, JSON.stringify(info), `${Date.now() - t0}ms`);
}

await browser.close();
preview.kill();

const fails = results.filter((r) => !r.ok || r.clearance < 50);
console.log('FAILS', fails.length ? fails : 'none');
console.log('pageErrors', errors.length ? errors.slice(0, 8) : 'none');
process.exit(fails.length || errors.some((e) => /Map|GLTF|load/i.test(e)) ? 1 : 0);
