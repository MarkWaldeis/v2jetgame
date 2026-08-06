// Findet pitch/roll/yaw-Korrekturen: Flügelspitzen gleich hoch, Nase −Z, Span auf X.
import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { loadJetGlb } from './src/game/aircraft/GlbJetLoader.ts';

// Node-side pure loader calibration (no game loop interference)
const root = fileURLToPath(new URL('.', import.meta.url));
const models = {
  p51: { url: './public/models/p51-mustang.glb', len: 9.8 },
  p40: { url: './public/models/p40.glb', len: 9.7 },
  spitfire: { url: './public/models/spitfire.glb', len: 9.1 },
  mig3: { url: './public/models/mig3.glb', len: 8.3 },
  mig15: { url: './public/models/mig15.glb', len: 10.1 },
};

function scoreGroup(group) {
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  const size = box.getSize(new THREE.Vector3());
  // Sample wing tips: max |x| vertices y-diff
  let leftY = 0, rightY = 0, leftN = 0, rightN = 0;
  let noseZ = 0, noseN = 0, tailZ = 0, tailN = 0;
  const v = new THREE.Vector3();
  group.traverse((o) => {
    if (!o.isMesh || !o.geometry?.attributes?.position) return;
    const pos = o.geometry.attributes.position;
    const step = Math.max(1, Math.floor(pos.count / 2000));
    for (let i = 0; i < pos.count; i += step) {
      v.fromBufferAttribute(pos, i);
      o.localToWorld(v);
      group.worldToLocal(v);
      if (v.x < -size.x * 0.35) {
        leftY += v.y;
        leftN++;
      } else if (v.x > size.x * 0.35) {
        rightY += v.y;
        rightN++;
      }
      if (v.z < box.min.z + size.z * 0.15) {
        noseZ += v.z;
        noseN++;
      }
      if (v.z > box.max.z - size.z * 0.15) {
        tailZ += v.z;
        tailN++;
      }
    }
  });
  const wingYDiff =
    leftN && rightN ? Math.abs(leftY / leftN - rightY / rightN) : 99;
  // Span should dominate height; length ~ size.z
  const spanScore = size.x / Math.max(size.y, 0.01); // higher better
  const lengthVsSpan = size.z / Math.max(size.x, 0.01);
  // Nose at more negative Z
  const noseOk = Math.abs(box.min.z) > Math.abs(box.max.z) * 0.5 ? 1 : 0;
  // Penalize huge length outliers (broken hierarchy)
  const lengthPenalty = size.z > 25 ? 50 : 0;
  // Wings level is critical
  const score =
    -wingYDiff * 8 +
    spanScore * 0.5 -
    Math.abs(lengthVsSpan - 0.85) * 2 +
    noseOk * 3 -
    lengthPenalty;
  return {
    score,
    wingYDiff: +wingYDiff.toFixed(3),
    size: {
      x: +size.x.toFixed(2),
      y: +size.y.toFixed(2),
      z: +size.z.toFixed(2),
    },
    noseOk: !!noseOk,
  };
}

const rolls = [-90, -60, -45, -30, -15, 0, 15, 30, 45, 60, 90, 180];
const pitches = [-90, -45, -30, -15, 0, 15, 30, 45, 90];
const yaws = [0, 180]; // skipDefaultYawFlip variants via yaw

const results = {};

for (const [id, def] of Object.entries(models)) {
  let best = null;
  console.log('Calibrating', id, '...');
  for (const skip of [false, true]) {
    for (const yawDeg of yaws) {
      for (const pitchDeg of pitches) {
        for (const rollDeg of rolls) {
          try {
            const { group, size } = await loadJetGlb(def.url, {
              targetLength: def.len,
              orient: {
                skipDefaultYawFlip: skip,
                yawDeg,
                pitchDeg,
                rollDeg,
                lengthIsLargest: false,
              },
            });
            const s = scoreGroup(group);
            const entry = {
              skip,
              yawDeg,
              pitchDeg,
              rollDeg,
              ...s,
              aabb: {
                x: +size.x.toFixed(2),
                y: +size.y.toFixed(2),
                z: +size.z.toFixed(2),
              },
            };
            if (!best || entry.score > best.score) best = entry;
          } catch (e) {
            // ignore load errors for bad combos
          }
        }
      }
    }
  }
  results[id] = best;
  console.log(id, JSON.stringify(best));
}

fs.writeFileSync(
  path.join(root, 'orient-calibrate-report.json'),
  JSON.stringify(results, null, 2)
);
console.log('DONE');
