/**
 * Visual-Check: alle Jets, Nachbrenner, Heck-/Seitenkamera, Screenshots + Nozzle-Positionen.
 * Pausiert das Spiel und entfernt Gegner, damit kein SHOT DOWN den Canvas verdeckt.
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import path from 'node:path';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const OUT = path.join(ROOT, 'shots', 'nozzles');
fs.mkdirSync(OUT, { recursive: true });

const jets = ['f16', 'f35', 'f14', 'l39', 'elite', 'su25', 'su34', 'su57'];
const report = [];

console.log('Building…');
await new Promise((resolve, reject) => {
  const b = spawn('npm run build', { cwd: ROOT, shell: true, stdio: 'inherit' });
  b.on('exit', (c) => (c === 0 ? resolve() : reject(new Error('build failed'))));
});

const preview = spawn('npx vite preview --port 4177 --strictPort', {
  cwd: ROOT,
  shell: true,
  stdio: 'ignore',
});
await new Promise((r) => setTimeout(r, 5000));

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1600, height: 900 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message)));

await page.goto('http://localhost:4177/', { waitUntil: 'networkidle0', timeout: 120000 });
await new Promise((r) => setTimeout(r, 3500));

// Unlock all jets in storage
await page.evaluate(() => {
  const s = {
    graphicsQuality: 'high',
    showHud: true,
    masterVolume: 0,
    muted: true,
    aeroCredits: 9_999_999,
    ownedJets: ['f16', 'f35', 'f14', 'l39', 'elite', 'su25', 'su34', 'su57'],
    completedCampaignLevels: [],
    campaignUnlockedMax: 5,
    economyMigratedV2: true,
  };
  localStorage.setItem('fightjet3d.settings.v1', JSON.stringify(s));
});

for (const jet of jets) {
  console.log('Checking', jet);
  await page.evaluate(async (id) => {
    const g = window.__game;
    // Frischer Modell-Load pro Jet (kein stale Cache/Visual)
    g.visualCache?.clear?.();
    g.visualPromises?.clear?.();
    g.loop?.start?.();
    await g.preloadAllAssets(id, 'islands', () => {});
    for (const e of g.enemies || []) {
      e.alive = false;
      e.position.y = -9999;
    }
    g.enemies.length = 0;
    for (const s of g.sams || []) s.alive = false;
    for (const a of g.aaaUnits || []) a.alive = false;
    g.player.hp = 99999;
    g.player.alive = true;
    // Loop stoppen → Kamera bleibt; UI ausblenden
    g.loop?.stop?.();
    document.querySelectorAll('.absolute.inset-0.z-30, .absolute.inset-0.z-10, .hud-tactical').forEach((el) => {
      el.style.visibility = 'hidden';
    });
  }, jet);
  await new Promise((r) => setTimeout(r, 600));

  // Jet bei (0, Y, 0); Kamera relativ dazu (Y = 900)
  const Y = 900;
  const setupView = async (camPos, lookAt) => {
    await page.evaluate(
      (pos, look, jetY) => {
        const g = window.__game;
        const p = g.player;
        p.object.position.set(0, jetY, 0);
        p.object.quaternion.identity();
        p.flight.snapVelocityToNose();
        p.flight.speed = 140;
        p.engineFx?.setAfterburner?.(true);
        for (let i = 0; i < 40; i++) p.engineFx?.update?.(1 / 30, 1, true);
        const cam = g.engine.camera;
        cam.position.set(pos[0], pos[1] + jetY, pos[2]);
        cam.up.set(0, 1, 0);
        cam.lookAt(look[0], look[1] + jetY, look[2]);
        cam.updateProjectionMatrix();
        g.engine.render();
      },
      camPos,
      lookAt,
      Y
    );
    await new Promise((r) => setTimeout(r, 120));
  };

  // Relative offsets: Heck (+Z), Seite (+X), 3/4
  await setupView([0, 1.4, 14], [0, 0.1, 5.2]);
  await page.screenshot({ path: path.join(OUT, `${jet}-aft.png`) });

  await setupView([12, 0.8, 2.5], [0, 0, 5]);
  await page.screenshot({ path: path.join(OUT, `${jet}-side.png`) });

  await setupView([7, 2.0, 11], [0, 0.2, 5]);
  await page.screenshot({ path: path.join(OUT, `${jet}-qtr.png`) });

  const info = await page.evaluate(() => {
    const g = window.__game;
    const p = g.player;
    const liveNozzles = [];
    const fx = p.engineFx?.group;
    if (fx) {
      fx.children.forEach((o) => {
        if (o.name?.startsWith('engineNozzleFx')) {
          liveNozzles.push({
            name: o.name,
            local: [+o.position.x.toFixed(3), +o.position.y.toFixed(3), +o.position.z.toFixed(3)],
          });
        }
      });
    }
    const anchors = p.anchors;
    return {
      jetId: p.jetId,
      loadoutId: p.loadout?.id,
      modelHint: p.visual?.name || p.visual?.children?.[0]?.name || null,
      anchors: anchors?.nozzles?.map((v) => [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)]),
      radii: anchors?.nozzleRadii?.map((r) => +r.toFixed(3)),
      scale: +(anchors?.nozzleScale ?? 0).toFixed(3),
      liveNozzles,
      fxVisible: !!p.engineFx?.group?.visible,
      twin: (anchors?.nozzles?.length ?? 0) >= 2,
    };
  });

  const zs = (info.anchors || []).map((a) => a[2]);
  const idMatch = info.jetId === jet && info.loadoutId === jet;
  const ok =
    idMatch &&
    info.fxVisible &&
    (info.anchors?.length || 0) >= 1 &&
    zs.every((z) => z > 2) &&
    (info.radii?.length || 0) >= 1;
  report.push({ jet, ok, idMatch, ...info });
  console.log(
    jet,
    ok ? 'OK' : 'CHECK',
    'loaded=',
    info.jetId,
    'nozzles=',
    JSON.stringify(info.anchors),
    'r=',
    info.radii,
    'scale=',
    info.scale
  );

  try {
    await page.evaluate(() => {
      document.querySelectorAll('.absolute.inset-0.z-30, .absolute.inset-0.z-10').forEach((el) => {
        el.style.visibility = '';
      });
      window.__game.loop?.start?.();
      window.__game.returnToMenu();
    });
  } catch {
    /* */
  }
  await new Promise((r) => setTimeout(r, 500));
}

// PowerShell treats node stderr deprecation as failure — explicit success log
console.log('VERIFY_DONE');

const summary = {
  report,
  errors,
  okCount: report.filter((r) => r.ok).length,
  total: report.length,
};
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(summary, null, 2));
console.log('Report →', path.join(OUT, 'report.json'));
console.log('OK', summary.okCount, '/', summary.total);

await browser.close();
preview.kill();
process.exit(summary.okCount === summary.total && errors.length === 0 ? 0 : 1);
