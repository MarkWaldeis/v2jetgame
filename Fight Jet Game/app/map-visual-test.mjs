// Reproducible high-/low-altitude visual and structural QA for Stormbreak.
import puppeteer from 'puppeteer';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const viteBin = fileURLToPath(new URL('./node_modules/vite/bin/vite.js', import.meta.url));
await mkdir(new URL('./output/playwright/', import.meta.url), { recursive: true });
const preview = spawn(process.execPath, [viteBin, 'preview', '--host', '127.0.0.1', '--port', '4192', '--strictPort'], {
  cwd: root,
  stdio: 'ignore',
});
await new Promise((resolve) => setTimeout(resolve, 5000));

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1440, height: 900 },
  protocolTimeout: 300000,
});
const page = await browser.newPage();
page.setDefaultTimeout(300000);
const errors = [];
page.on('pageerror', (error) => errors.push(String(error.message || error)));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});

try {
  await page.goto('http://127.0.0.1:4192/', { waitUntil: 'networkidle0', timeout: 120000 });
  await new Promise((resolve) => setTimeout(resolve, 3000));
  await page.evaluate(() => {
    const game = window.__game;
    game.state = 'paused';
    const style = document.createElement('style');
    style.textContent = '.liquid-ui-root > :not(canvas) { display: none !important; }';
    document.head.appendChild(style);
  });

  const views = [
    { name: 'stormbreak-high-altitude', position: [12800, 8200, 15600], target: [-900, 420, 400], fov: 62 },
    { name: 'stormbreak-low-airbase', position: [850, 150, 3950], target: [-20, 55, 2500], fov: 58 },
    { name: 'stormbreak-low-coast', position: [15500, 52, 15700], target: [10400, 30, 12600], fov: 64 },
  ];
  for (const view of views) {
    await page.evaluate(({ position, target, fov }) => {
      const game = window.__game;
      const camera = game.engine.camera;
      camera.position.set(...position);
      camera.up.set(0, 1, 0);
      camera.fov = fov;
      camera.updateProjectionMatrix();
      camera.lookAt(...target);
      game.engine.render();
    }, view);
    await new Promise((resolve) => setTimeout(resolve, 300));
    await page.screenshot({ path: `output/playwright/${view.name}.png` });
  }

  const report = await page.evaluate(() => {
    const game = window.__game;
    const terrain = game.proceduralTerrain;
    const names = [];
    game.engine.scene.traverse((object) => { if (object.name) names.push(object.name); });
    const samples = [];
    for (let z = -18000; z <= 18000; z += 1500) {
      for (let x = -18000; x <= 18000; x += 1500) samples.push(terrain.getHeight(x, z));
    }
    return {
      size: terrain.size,
      minHeight: Math.min(...samples),
      maxHeight: Math.max(...samples),
      invalidHeights: samples.filter((value) => !Number.isFinite(value)).length,
      spawnGround: terrain.getHeight(0, 3000),
      oceanShader: names.includes('water-surface-fresnel-gerstner'),
      runway: names.includes('runway-centerline-instanced'),
      instancedNature: names.includes('instanced-vegetation-and-rocks'),
      hangarLods: names.filter((name) => name === 'hangar-lod').length,
    };
  });
  console.log(JSON.stringify({ report, errors }, null, 2));
  const failed = report.size < 40000 || report.invalidHeights > 0 || Math.abs(report.spawnGround - 32) > 8 ||
    !report.oceanShader || !report.runway || !report.instancedNature || report.hangarLods < 6 || errors.length > 0;
  process.exitCode = failed ? 1 : 0;
} finally {
  await browser.close();
  preview.kill();
}
