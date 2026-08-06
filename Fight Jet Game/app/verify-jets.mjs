// Vollständige Jet-Verifikation: Zentrierung, Waffen, Düsen, Ausrichtung
// Pro Jet: numerische Checks + 3 Screenshots (Heck/Chase, Seite, Oben)
import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = fileURLToPath(new URL('.', import.meta.url));
const OUT = path.join(root, 'shots', 'verify');
fs.mkdirSync(OUT, { recursive: true });

const preview = spawn('npx', ['vite', 'preview', '--host', '127.0.0.1', '--port', '4176', '--strictPort'], {
  cwd: root, shell: true, stdio: 'ignore',
});
await new Promise((r) => setTimeout(r, 5000));

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1400, height: 900 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto('http://127.0.0.1:4176/', { waitUntil: 'networkidle0', timeout: 90000 });
await new Promise((r) => setTimeout(r, 4000));

const catalog = ['f16', 'f35', 'f14', 'l39', 'elite', 'su25', 'su34', 'su57'];

const results = [];
for (const id of catalog) {
  let diag = null;
  let err = null;
  try {
    diag = await page.evaluate(async (jetId) => {
      const g = window.__game;
      await g.startGame(jetId);
      await new Promise((r) => setTimeout(r, 500));
      const p = g.player;
      // Jet einfrieren
      p.flight.speed = 0;
      p.object.position.set(0, 900, 3000);
      p.object.quaternion.identity();
      p.object.updateMatrixWorld(true);
      p.setAfterburner(true);
      p.engineFx.update(0.05, 1, true);

      const V3 = p.object.position.constructor;
      const visual = p.object.getObjectByName('glbJet');

      // BBox in Aircraft-lokal (object space) aus Vertices
      const min = new V3(Infinity, Infinity, Infinity);
      const max = new V3(-Infinity, -Infinity, -Infinity);
      const v = new V3();
      visual.traverse((obj) => {
        if (!obj.isMesh || !obj.geometry?.attributes?.position || !obj.visible) return;
        const pos = obj.geometry.attributes.position;
        const step = Math.max(1, Math.floor(pos.count / 4000));
        for (let i = 0; i < pos.count; i += step) {
          v.fromBufferAttribute(pos, i);
          obj.localToWorld(v);           // world == object-space verschoben um object.position
          p.object.worldToLocal(v);
          min.min(v); max.max(v);
        }
      });
      const cx = (min.x + max.x) / 2, cy = (min.y + max.y) / 2, cz = (min.z + max.z) / 2;
      const span = max.x - min.x, len = max.z - min.z, hgt = max.y - min.y;

      const hp = p.getHardpoints().map((a) => [+a.x.toFixed(2), +a.y.toFixed(2), +a.z.toFixed(2)]);
      const noz = (p.anchors?.nozzles ?? []).map((a) => [+a.x.toFixed(2), +a.y.toFixed(2), +a.z.toFixed(2)]);
      const muz = p.getMuzzles().map((a) => [+a.x.toFixed(2), +a.y.toFixed(2), +a.z.toFixed(2)]);

      // Flügel-Unterseite und montierte Raketen-Y prüfen
      let wingSkinY = 0, wingN = 0;
      const halfW = (max.x - min.x) * 0.5;
      visual.traverse((obj) => {
        if (!obj.isMesh || !obj.geometry?.attributes?.position || !obj.visible) return;
        const pos = obj.geometry.attributes.position;
        const step = Math.max(1, Math.floor(pos.count / 2500));
        for (let i = 0; i < pos.count; i += step) {
          v.fromBufferAttribute(pos, i);
          obj.localToWorld(v);
          p.object.worldToLocal(v);
          if (Math.abs(v.x) > halfW * 0.55 && Math.abs(v.x) < halfW * 0.95 && v.y < cy) {
            wingSkinY += v.y;
            wingN++;
          }
        }
      });
      const avgWingY = wingN > 8 ? wingSkinY / wingN : cy - 0.5;
      const mounted = [];
      p.missileRack?.traverse((o) => {
        if (o.name?.startsWith('mountedMissile-')) {
          mounted.push([+o.position.x.toFixed(2), +o.position.y.toFixed(2), +o.position.z.toFixed(2)]);
        }
      });

      // Nase/Heck-Heuristik: mittlerer Radius der Vertices in vorderem/hinterem 12%-Band
      let rF = 0, nF = 0, rA = 0, nA = 0;
      const bandF = min.z + len * 0.12, bandA = max.z - len * 0.12;
      visual.traverse((obj) => {
        if (!obj.isMesh || !obj.geometry?.attributes?.position || !obj.visible) return;
        const pos = obj.geometry.attributes.position;
        const step = Math.max(1, Math.floor(pos.count / 4000));
        for (let i = 0; i < pos.count; i += step) {
          v.fromBufferAttribute(pos, i);
          obj.localToWorld(v);
          p.object.worldToLocal(v);
          const rad = Math.hypot(v.x - cx, v.y - cy);
          if (v.z <= bandF) { rF += rad; nF++; }
          else if (v.z >= bandA) { rA += rad; nA++; }
        }
      });

      return {
        center: [+cx.toFixed(3), +cy.toFixed(3), +cz.toFixed(3)],
        min: [+min.x.toFixed(2), +min.y.toFixed(2), +min.z.toFixed(2)],
        max: [+max.x.toFixed(2), +max.y.toFixed(2), +max.z.toFixed(2)],
        span: +span.toFixed(2), len: +len.toFixed(2), hgt: +hgt.toFixed(2),
        hardpoints: hp, nozzles: noz, muzzles: muz,
        avgWingY: +avgWingY.toFixed(2),
        mounted,
        noseRadFront: nF ? +(rF / nF).toFixed(2) : null,
        tailRadAft: nA ? +(rA / nA).toFixed(2) : null,
      };
    }, id);

    // Checks auswerten
    const c = diag.center;
    const problems = [];
    // Vertex-Sampling + AABB weichen leicht ab; 15 cm X/Z sind spielerisch unsichtbar
    if (Math.abs(c[0]) > 0.15 || Math.abs(c[2]) > 0.15) {
      problems.push(`NICHT ZENTRIERT: center=(${c})`);
    }
    const halfSpan = diag.span / 2;
    diag.hardpoints.forEach((h, i) => {
      if (Math.abs(h[0]) > halfSpan + 0.25) problems.push(`HP${i} ausserhalb Spannweite: x=${h[0]} (span/2=${halfSpan.toFixed(2)})`);
      if (h[2] < diag.min[2] - 0.3 || h[2] > diag.max[2] + 0.3) problems.push(`HP${i} ausserhalb Rumpf: z=${h[2]}`);
    });
    for (let i = 0; i + 1 < diag.hardpoints.length; i += 2) {
      const L = diag.hardpoints[i], R = diag.hardpoints[i + 1];
      if (Math.abs(L[0] + R[0]) > 0.2 || Math.abs(L[1] - R[1]) > 0.2) problems.push(`HP-Paar ${i}/${i + 1} asymmetrisch: ${L} vs ${R}`);
    }
    diag.nozzles.forEach((n, i) => {
      if (n[2] < diag.max[2] - diag.len * 0.35) problems.push(`Duese ${i} nicht am Heck: z=${n[2]} (maxZ=${diag.max[2]})`);
      if (Math.abs(n[0]) > halfSpan) problems.push(`Duese ${i} ausserhalb Rumpf: x=${n[0]}`);
    });
    diag.muzzles.forEach((m, i) => {
      if (m[2] > diag.min[2] + diag.len * 0.4) problems.push(`Muendung ${i} nicht am Bug: z=${m[2]} (minZ=${diag.min[2]})`);
    });
    // Rückwärts: Düsen müssen am Heck (+Z), Mündungen am Bug (−Z) liegen.
    // Radius-Heuristik (Bug spitzer) liefert bei modernen Jets False Positives
    // (breite Einläufe/Canards vs. schlanke Düsen).
    if (diag.nozzles.length && diag.muzzles.length) {
      const avgNozZ = diag.nozzles.reduce((s, n) => s + n[2], 0) / diag.nozzles.length;
      const avgMuzZ = diag.muzzles.reduce((s, m) => s + m[2], 0) / diag.muzzles.length;
      if (avgNozZ < avgMuzZ) {
        problems.push(`RUECKWAERTS: Duesen z=${avgNozZ.toFixed(2)} vor Muendungen z=${avgMuzZ.toFixed(2)}`);
      }
    }
    // Raketen unter dem Flügel: äussere Stationen (|x| gross) unter Wing-Skin.
    // Bauch-Pylone liegen oft höher als die Flügelspitzen-Unterseite — ok.
    const midY = (diag.min[1] + diag.max[1]) / 2;
    diag.hardpoints.forEach((h, i) => {
      if (h[1] > midY + 0.15) {
        problems.push(`HP${i} UEBER Mitte (y=${h[1]} midY=${midY.toFixed(2)}) — soll unter Fluegel`);
      }
      const isOuterWing = Math.abs(h[0]) > halfSpan * 0.35;
      if (isOuterWing && diag.avgWingY != null && h[1] > diag.avgWingY + 0.45) {
        problems.push(`HP${i} UEBER Fluegel (y=${h[1]} wingY≈${diag.avgWingY})`);
      }
    });

    // Screenshots: Heck (chase), Seite, Oben
    const views = [
      { name: 'rear', rot: null },
      { name: 'side', rot: ['y', Math.PI / 2] },
      { name: 'top', rot: ['x', -Math.PI / 2] },
    ];
    for (const vw of views) {
      await page.evaluate(([axis, ang]) => {
        const g = window.__game;
        const p = g.player;
        p.flight.speed = 0;
        p.object.position.set(0, 900, 3000);
        p.object.quaternion.identity();
        if (axis) {
          const V3 = p.object.position.constructor;
          const ax = axis === 'y' ? new V3(0, 1, 0) : new V3(1, 0, 0);
          p.object.quaternion.setFromAxisAngle(ax, ang);
        }
        p.setAfterburner(true);
        p.engineFx.update(0.05, 1, true);
        g.cam.snapBehind(p.object);
      }, vw.rot ? vw.rot : [null, 0]);
      await new Promise((r) => setTimeout(r, 350));
      await page.evaluate(() => {
        const g = window.__game;
        const p = g.player;
        p.flight.speed = 0;
        p.setAfterburner(true);
        p.engineFx.update(0.05, 1, true);
      });
      await new Promise((r) => setTimeout(r, 150));
      await page.screenshot({ path: path.join(OUT, `${id}-${vw.name}.png`) });
    }

    results.push({ id, ok: problems.length === 0, problems, diag });
    console.log(id, problems.length ? 'PROBLEME:' : 'OK', problems.join(' | '));
  } catch (e) {
    err = String(e?.message || e);
    results.push({ id, ok: false, problems: [err], diag });
    console.log(id, 'FEHLER', err);
  }
}

await browser.close();
preview.kill();
fs.writeFileSync(path.join(root, 'verify-jets-report.json'), JSON.stringify(results, null, 2));
const fails = results.filter((r) => !r.ok);
console.log('\n=== ERGEBNIS:', fails.length ? `${fails.length} Jets mit Problemen: ${fails.map((f) => f.id).join(', ')}` : 'ALLE OK');
console.log('PAGEERRORS', errors.length ? errors : 'none');
process.exit(fails.length || errors.length ? 1 : 0);
