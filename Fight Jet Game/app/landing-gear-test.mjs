// Headless integration test for landing, missile rearm, takeoff and all jet gear profiles.
import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = fileURLToPath(new URL('.', import.meta.url));
const out = path.join(root, 'landing-test-output');
fs.mkdirSync(out, { recursive: true });

const preview = spawn(
  'npx',
  ['vite', 'preview', '--host', '127.0.0.1', '--port', '4177', '--strictPort'],
  { cwd: root, shell: true, stdio: 'ignore' }
);
await new Promise((resolve) => setTimeout(resolve, 4500));

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1440, height: 900 },
});
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));
await page.goto('http://127.0.0.1:4177/', { waitUntil: 'networkidle0', timeout: 90000 });
await page.waitForFunction(() => Boolean(window.__game), { timeout: 30000 });

const jets = ['f16', 'f35', 'f14', 'l39', 'elite', 'su25', 'su34', 'su57'];
const report = [];

for (const id of jets) {
  let result;
  try {
    result = await page.evaluate(async (jetId) => {
      const g = window.__game;
      await g.startGame(jetId);
      g.loop.stop();
      g.clearActors();
      g.state = 'playing';

      const p = g.player;
      const input = g.input;
      const terrain = g.heightField;
      const gear = p.loadout.landingGear;

      let spot = null;
      for (let z = -8000; z <= 8000 && !spot; z += 500) {
        for (let x = -8000; x <= 8000; x += 500) {
          const y = terrain.getHeight(x, z);
          if (y < 8) continue;
          const dx = (terrain.getHeight(x + 8, z) - terrain.getHeight(x - 8, z)) / 16;
          const dz = (terrain.getHeight(x, z + 8) - terrain.getHeight(x, z - 8)) / 16;
          if (Math.atan(Math.hypot(dx, dz)) * 180 / Math.PI <= 7) {
            spot = { x, y, z };
            break;
          }
        }
      }
      if (!spot) throw new Error('Keine flache Landefläche gefunden');

      input.throttle = 0;
      input.pitch = 0;
      input.roll = 0;
      input.yaw = 0;
      input.airbrake = true;
      input.manualOverride = false;
      p.groundState = 'airborne';
      p.takeoffGrace = 0;
      p.object.quaternion.identity();
      p.position.set(spot.x, spot.y + gear.groundClearance + 0.004, spot.z);
      p.flight.speed = gear.landingSpeed * 0.55;
      p.flight.velocityDir.set(0, -0.03, -1).normalize();
      p.missilesLeft = 0;
      p.resetMountedMissiles(0);

      let crashed = false;
      for (let i = 0; i < 8 && !p.isGrounded && !crashed; i++) {
        p.update(1 / 120, input, terrain, () => { crashed = true; }, {
          mouseAim: false,
          waterLevel: 0,
        });
      }

      const landed = p.isGrounded && !crashed;
      const landingEvent = p.consumeLandedEvent();
      if (landingEvent) p.rearmMissiles();
      const rearmed = p.missilesLeft === p.loadout.stats.missiles;

      const noseWheelError =
        gear.groundClearance + gear.noseMount[1] - gear.noseStrutLength - gear.wheelRadius;
      const mainWheelError =
        gear.groundClearance + gear.leftMainMount[1] - gear.mainStrutLength - gear.wheelRadius;

      p.landingGear.setExtended(true, true);
      p.object.quaternion.identity();
      p.position.set(spot.x, spot.y + gear.groundClearance, spot.z);
      p.object.updateMatrixWorld(true);
      const model = p.object.getObjectByName('glbJet');
      let modelBottom = null;
      if (model) {
        let minY = Infinity;
        model.updateMatrixWorld(true);
        model.traverse((obj) => {
          if (!obj.isMesh || !obj.geometry) return;
          if (!obj.geometry.boundingBox) obj.geometry.computeBoundingBox();
          const box = obj.geometry.boundingBox;
          for (const x of [box.min.x, box.max.x]) {
            for (const y of [box.min.y, box.max.y]) {
              for (const z of [box.min.z, box.max.z]) {
                const point = obj.position.clone().set(x, y, z).applyMatrix4(obj.matrixWorld);
                minY = Math.min(minY, point.y);
              }
            }
          }
        });
        if (Number.isFinite(minY)) modelBottom = minY - spot.y;
      }

      g.cam.snapBehind(p.object);
      g.engine.camera.position.set(spot.x + 16, spot.y + 7, spot.z + 18);
      g.engine.camera.lookAt(spot.x, spot.y + 1.6, spot.z);
      g.engine.render();

      input.pitch = 1;
      input.airbrake = false;
      input.throttle = 1;
      p.flight.speed = gear.takeoffSpeed + 2;
      const beforeExtension = p.landingGear.extension;
      p.update(1 / 120, input, terrain, () => { crashed = true; }, {
        mouseAim: false,
        waterLevel: 0,
      });
      const tookOff = p.groundState === 'airborne' && p.consumeTookOffEvent();
      p.landingGear.update(0.6);
      const gearRetracting = p.landingGear.extension < beforeExtension;

      return {
        jetId,
        landed,
        crashed,
        rearmed,
        tookOff,
        gearRetracting,
        noseWheelError,
        mainWheelError,
        modelBottom,
      };
    }, id);

    await page.screenshot({ path: path.join(out, `landing-${id}.png`) });
  } catch (error) {
    result = { jetId: id, error: String(error?.message || error) };
  }

  const ok =
    !result.error &&
    result.landed &&
    !result.crashed &&
    result.rearmed &&
    result.tookOff &&
    result.gearRetracting &&
    Math.abs(result.noseWheelError) <= 0.05 &&
    Math.abs(result.mainWheelError) <= 0.05 &&
    result.modelBottom != null &&
    result.modelBottom >= -0.1;
  report.push({ id, ok, ...result });
  console.log(id, ok ? 'OK' : 'FAIL', JSON.stringify(result));
}

await browser.close();
preview.kill();
fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ pageErrors, report }, null, 2));

const failures = report.filter((entry) => !entry.ok);
console.log('PAGEERRORS', pageErrors.length ? pageErrors : 'none');
console.log('FAILURES', failures.length ? failures : 'none');
process.exit(pageErrors.length || failures.length ? 1 : 0);
