// Local GLB diagnostic: loads every catalog jet and reports mesh/vertex bounds.
import puppeteer from 'puppeteer';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const viteBin = fileURLToPath(new URL('./node_modules/vite/bin/vite.js', import.meta.url));
const preview = spawn(process.execPath, [viteBin, 'preview', '--host', '127.0.0.1', '--port', '4193', '--strictPort'], {
  cwd: root,
  stdio: 'ignore',
});
await new Promise((resolve) => setTimeout(resolve, 5000));

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
try {
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:4193/', { waitUntil: 'networkidle0', timeout: 120000 });
  await new Promise((resolve) => setTimeout(resolve, 2500));
  const report = [];
  for (const id of ['f16', 'f35', 'f14', 'l39', 'elite', 'su25', 'su34', 'su57']) {
    const info = await page.evaluate(async (jetId) => {
      const game = window.__game;
      await game.selectJet(jetId);
      const rootObject = game.player.object;
      let meshes = 0;
      let vertices = 0;
      rootObject.traverse((object) => {
        if (!object.isMesh) return;
        meshes++;
        vertices += object.geometry?.attributes?.position?.count ?? 0;
      });
      return {
        id: jetId,
        meshes,
        vertices,
        visualSpan: +game.player.visualSpan.toFixed(2),
        visualLength: +game.player.visualLength.toFixed(2),
        camFit: game.player.camFit,
      };
    }, id);
    report.push(info);
  }
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
  preview.kill();
}
