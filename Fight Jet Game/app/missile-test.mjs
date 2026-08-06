// Smoke-Test: Rakete startet am Hardpoint, hat Visual, fliegt los
import puppeteer from 'puppeteer';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const preview = spawn(
  'npx',
  ['vite', 'preview', '--host', '127.0.0.1', '--port', '4191', '--strictPort'],
  { cwd: root, shell: true, stdio: 'ignore' }
);
await new Promise((r) => setTimeout(r, 5500));

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1280, height: 720 },
  protocolTimeout: 180000,
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message || e)));

await page.goto('http://127.0.0.1:4191/', { waitUntil: 'networkidle0', timeout: 90000 });
await new Promise((r) => setTimeout(r, 5000));

const report = await page.evaluate(async () => {
  const g = window.__game;
  if (!g) return [{ ok: false, error: 'no game' }];
  const ids = ['f16', 'f35', 'f14', 'l39', 'elite', 'su25', 'su34', 'su57'];
  const results = [];

  for (const id of ids) {
    await g.startGame(id);
    await new Promise((resolve) => setTimeout(resolve, 900));
    g.state = 'paused';

    const enemy = g.enemies?.find((item) => item.alive);
    const hardpoints = g.player.getHardpoints();
    const mounted = [...g.player.missileRack.children];
    if (!enemy || !hardpoints.length) {
      results.push({ id, ok: false, error: !enemy ? 'no enemy' : 'no hardpoints' });
      continue;
    }

    g.player.lockTarget = enemy;
    g.player.lockProgress = 1;
    const station = g.player.missileStation;
    const hpWorld = hardpoints[station]
      .clone()
      .applyQuaternion(g.player.object.quaternion)
      .add(g.player.position);
    const mountedAtStation = mounted.find((item) => item.name === `mountedMissile-${station}`);
    const mountedBefore = Boolean(mountedAtStation?.visible);

    const before = g.missiles.length;
    g.launchPlayerMissile();
    const missile = g.missiles[g.missiles.length - 1];
    if (!missile || g.missiles.length <= before) {
      results.push({ id, ok: false, error: 'launch did not spawn' });
      continue;
    }

    const distToHp = missile.object.position.distanceTo(hpWorld);
    const mountedReleased = mountedAtStation?.visible === false;
    const hasMotor = Boolean(missile.object.getObjectByName('missileMotorCore'));
    const hasModel = missile.object.children.some((item) => item.name.startsWith('missile_'));
    const start = missile.object.position.clone();
    for (let index = 0; index < 12; index++) missile.update(0.025);
    const motorVisible = missile.object.getObjectByName('missileMotorCore')?.visible === true;
    for (let index = 0; index < 28; index++) missile.update(0.025);
    const moved = missile.object.position.distanceTo(start);

    results.push({
      id,
      ok:
        mounted.length === hardpoints.length &&
        mountedBefore &&
        mountedReleased &&
        distToHp < 0.05 &&
        moved > 40 &&
        hasMotor &&
        motorVisible &&
        hasModel,
      distToHp: +distToHp.toFixed(3),
      moved: +moved.toFixed(1),
      stations: hardpoints.length,
      mounted: mounted.length,
      mountedReleased,
      hasMotor,
      motorVisible,
      hasModel,
    });
  }
  return results;
});

console.log(JSON.stringify(report, null, 2));
console.log('errors', errs.slice(0, 6));
await browser.close();
preview.kill();
process.exit(report.every((item) => item.ok) && !errs.length ? 0 : 1);
