// FX-State-Dump: Düsen-Opazitäten, Welt-Positionen, Screen-Projektion.
import puppeteer from 'puppeteer';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const OUT = fileURLToPath(new URL('./shots/', import.meta.url));
const errors = [];

const preview = spawn('npx', ['vite', 'preview', '--port', '4175', '--strictPort'], {
  cwd: fileURLToPath(new URL('.', import.meta.url)),
  shell: true,
  stdio: 'ignore',
});
await new Promise((r) => setTimeout(r, 4000));

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1200, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto('http://localhost:4175/', { waitUntil: 'networkidle0', timeout: 60000 });
await new Promise((r) => setTimeout(r, 4000));

for (const jet of ['f16', 'f35', 'elite']) {
  await page.evaluate(async (id) => { await window.__game.startGame(id); }, jet);
  await new Promise((r) => setTimeout(r, 1200));
  await page.keyboard.down('ShiftLeft');
  await page.keyboard.down('Tab');
  await new Promise((r) => setTimeout(r, 3000));
  // Deterministisch einfrieren (kein Keypress-Race): State direkt setzen,
  // solange AB noch aktiv ist → FX friert auf vollem AB-Level ein
  await page.evaluate(() => { window.__game.state = 'paused'; });
  await page.keyboard.up('ShiftLeft');
  await page.keyboard.up('Tab');
  await new Promise((r) => setTimeout(r, 300));

  const dbg = await page.evaluate(() => {
    const g = window.__game;
    const p = g.player.object.position;
    const q = g.player.object.quaternion;
    // Kamera hinters Heck
    const rear = new p.constructor(0, 0, 1).applyQuaternion(q).normalize();
    const cam = g.engine.camera;
    cam.position.set(p.x + rear.x * 20 + 2, p.y + rear.y * 20 + 2, p.z + rear.z * 20);
    cam.up.set(0, 1, 0);
    cam.lookAt(p.x, p.y, p.z);
    cam.updateMatrixWorld(true);

    const fx = g.player.engineFx;
    const out = [];
    fx.group.updateMatrixWorld(true);
    for (const nz of fx.group.children) {
      if (!nz.isGroup) continue;
      const wp = new p.constructor();
      nz.getWorldPosition(wp);
      const ndc = wp.clone().project(cam);
      const [core, outer, glow] = nz.children;
      out.push({
        world: wp.toArray().map((v) => Math.round(v)),
        ndc: ndc.toArray().map((v) => +v.toFixed(2)),
        coreVis: core.visible, coreOp: +core.material.opacity.toFixed(2),
        outerVis: outer.visible, outerOp: +outer.material.opacity.toFixed(2),
        glowOp: +glow.material.opacity.toFixed(2),
        coreScale: core.scale.toArray().map((v) => +v.toFixed(1)),
      });
    }
    return { state: g.state, playerPos: p.toArray().map(Math.round), camPos: cam.position.toArray().map(Math.round), nozzles: out };
  });
  console.log(jet, JSON.stringify(dbg, null, 1));

  // Overlay (HUD/Menüs) per injiziertem CSS dauerhaft ausblenden —
  // überlebt React-Re-Renders (Canvas ist direktes Kind des Wrapper-Divs)
  await page.addStyleTag({ content: '#root > div > *:not(canvas) { display: none !important; }' });
  await new Promise((r) => setTimeout(r, 300));
  await page.screenshot({ path: `${OUT}tail-${jet}.png` });
  await page.evaluate(() => {
    document.querySelectorAll('style').forEach((s) => { if (s.textContent.includes(':not(canvas)')) s.remove(); });
  });
}

console.log('Fehler:', errors.length ? errors : 'KEINE');
await browser.close();
preview.kill();
