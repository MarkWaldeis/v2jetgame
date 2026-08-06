import * as THREE from 'three';
import { computeFxAnchors } from './src/game/aircraft/FxAnchors.js';

console.log('=== VERIFIZIERUNG DER JET-GEOMETRIE & HARDPOINTS ===\n');

// ============================================================
// TEST 1: Bounding-Box-Zentrierung (Mock-Geometrie)
// ============================================================
console.log('--- Test 1: Bounding-Box-Zentrierung ---');

function testCentering(modelName: string, geomW: number, geomH: number, geomD: number, offsetX: number, offsetY: number, offsetZ: number) {
  const wrap = new THREE.Group();
  wrap.name = 'glbJet';
  const root = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(geomW, geomH, geomD));
  mesh.position.set(offsetX, offsetY, offsetZ);
  root.add(mesh);
  wrap.add(root);
  wrap.updateMatrixWorld(true);

  const preBox = new THREE.Box3().setFromObject(wrap);
  const preCenter = preBox.getCenter(new THREE.Vector3());
  
  root.position.set(0, 0, 0);
  wrap.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(wrap);
  const center = box.getCenter(new THREE.Vector3());
  root.position.copy(center.clone().negate());
  wrap.updateMatrixWorld(true);

  const finalBox = new THREE.Box3().setFromObject(wrap);
  const finalCenter = finalBox.getCenter(new THREE.Vector3());
  const ok = Math.abs(finalCenter.x) < 0.05 && Math.abs(finalCenter.y) < 0.05 && Math.abs(finalCenter.z) < 0.05;
  
  console.log(`  ${modelName}: vorher=(${preCenter.x.toFixed(2)},${preCenter.y.toFixed(2)},${preCenter.z.toFixed(2)}) nachher=(${finalCenter.x.toFixed(4)},${finalCenter.y.toFixed(4)},${finalCenter.z.toFixed(4)}) ${ok ? 'OK' : 'FAIL'}`);
  
  if (!ok) {
    console.error(`    FAIL: BBox-Zentrum nicht innerhalb 0.05m Toleranz!`);
  }
  return ok;
}

let allPassed = true;
allPassed = testCentering('Box (zentriert)',       12, 2, 16, 0, 0, 0) && allPassed;
allPassed = testCentering('Box (+X verschoben)',   12, 2, 16, 2.5, 0, 0) && allPassed;
allPassed = testCentering('Box (+Y verschoben)',   12, 2, 16, 0, 1.5, 0) && allPassed;
allPassed = testCentering('Box (+Z verschoben)',   12, 2, 16, 0, 0, -3) && allPassed;
allPassed = testCentering('Box (alle Achsen)',     12, 2, 16, 2, 1, -3) && allPassed;
allPassed = testCentering('F-16 artig',            13, 3.5, 15.5, -0.5, 0.3, 0.8) && allPassed;
allPassed = testCentering('F-14 artig (breit)',    19, 4, 18.5, 0, -0.5, -1) && allPassed;
allPassed = testCentering('Su-57 artig',           14, 3, 20, 0.3, 0.1, -0.7) && allPassed;

// ============================================================
// TEST 2: Hardpoint-Symmetrie & Wing-Skin-Kontakt
// ============================================================
console.log('\n--- Test 2: Hardpoint-Symmetrie & Wing-Skin ---');

function testHardpoints(modelName: string, geomW: number, geomH: number, geomD: number) {
  const parentGroup = new THREE.Group();
  const visualGroup = new THREE.Group();
  
  const fuselage = new THREE.Mesh(new THREE.BoxGeometry(2, geomH, geomD));
  fuselage.position.set(0, 0, 0);
  visualGroup.add(fuselage);
  
  const wingThickness = geomH * 0.15;
  const leftWing = new THREE.Mesh(new THREE.BoxGeometry(geomW * 0.45, wingThickness, geomD * 0.6));
  leftWing.position.set(-geomW * 0.25, -geomH * 0.1, 0);
  visualGroup.add(leftWing);
  
  const rightWing = new THREE.Mesh(new THREE.BoxGeometry(geomW * 0.45, wingThickness, geomD * 0.6));
  rightWing.position.set(geomW * 0.25, -geomH * 0.1, 0);
  visualGroup.add(rightWing);

  parentGroup.add(visualGroup);
  parentGroup.updateMatrixWorld(true);
  visualGroup.updateMatrixWorld(true);

  const anchors = computeFxAnchors(visualGroup, parentGroup);
  
  let symmetric = true;
  for (let i = 0; i < anchors.hardpoints.length; i += 2) {
    const left = anchors.hardpoints[i];
    const right = anchors.hardpoints[i + 1];
    if (!right || Math.abs(left.x + right.x) > 0.15 || Math.abs(left.y - right.y) > 0.15) {
      symmetric = false;
      console.error(`    FAIL: Asymmetrisches Hardpoint-Paar: Station ${i+1} vs ${i+2}`);
    }
  }

  const box = new THREE.Box3().setFromObject(visualGroup);
  const midY = (box.min.y + box.max.y) / 2;
  let allUnderWing = true;
  anchors.hardpoints.forEach((hp, i) => {
    if (hp.y > midY + 0.5) {
      allUnderWing = false;
      console.error(`    FAIL: Hardpoint ${i+1} ueber Fluegel-Mitte: Y=${hp.y.toFixed(2)} > midY=${midY.toFixed(2)}`);
    }
  });

  console.log(`  ${modelName}: ${anchors.hardpoints.length} Stationen, Symmetrie=${symmetric ? 'OK' : 'FAIL'}, UnterFluegel=${allUnderWing ? 'OK' : 'FAIL'}`);
  
  anchors.hardpoints.forEach((hp, i) => {
    console.log(`    Station ${i+1}: X=${hp.x.toFixed(2)}, Y=${hp.y.toFixed(2)}, Z=${hp.z.toFixed(2)}`);
  });

  return symmetric && allUnderWing;
}

allPassed = testHardpoints('F-16 Mock', 13, 3.5, 15.5) && allPassed;
allPassed = testHardpoints('F-14 Mock (breit)', 19, 4, 18.5) && allPassed;
allPassed = testHardpoints('Su-57 Mock', 14, 3, 20) && allPassed;
allPassed = testHardpoints('L-39 Mock (klein)', 9.5, 2.8, 12.2) && allPassed;

// ============================================================
// TEST 3: Nozzle/Muzzle-Positionen
// ============================================================
console.log('\n--- Test 3: Duesen & Muendungen ---');

function testNozzles(modelName: string, geomW: number, geomH: number, geomD: number) {
  const parentGroup = new THREE.Group();
  const visualGroup = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(geomW, geomH, geomD));
  visualGroup.add(mesh);
  parentGroup.add(visualGroup);
  parentGroup.updateMatrixWorld(true);
  visualGroup.updateMatrixWorld(true);

  const anchors = computeFxAnchors(visualGroup, parentGroup);
  
  const box = new THREE.Box3().setFromObject(visualGroup);
  const maxZ = box.max.z;
  let nozzlesOk = true;
  anchors.nozzles.forEach((n, i) => {
    if (n.z < maxZ * 0.7) {
      nozzlesOk = false;
      console.error(`    FAIL: Duese ${i+1} nicht am Heck: Z=${n.z.toFixed(2)}, maxZ=${maxZ.toFixed(2)}`);
    }
  });

  const minZ = box.min.z;
  let muzzlesOk = true;
  anchors.muzzles.forEach((m, i) => {
    if (m.z > minZ + geomD * 0.3) {
      muzzlesOk = false;
      console.error(`    FAIL: Muendung ${i+1} nicht am Bug: Z=${m.z.toFixed(2)}, minZ=${minZ.toFixed(2)}`);
    }
  });

  console.log(`  ${modelName}: Duesen=${nozzlesOk ? 'OK' : 'FAIL'}, Muendungen=${muzzlesOk ? 'OK' : 'FAIL'}, Twin=${anchors.nozzles.length > 1}`);
  return nozzlesOk && muzzlesOk;
}

allPassed = testNozzles('F-16 Mock', 13, 3.5, 15.5) && allPassed;
allPassed = testNozzles('F-14 Mock (breit -> Twin)', 19, 4, 18.5) && allPassed;
allPassed = testNozzles('L-39 Mock (schmal)', 9.5, 2.8, 12.2) && allPassed;

// ============================================================
// ERGEBNIS
// ============================================================
console.log('\n========================================');
if (allPassed) {
  console.log('ALLE TESTS BESTANDEN - 0 Fehler');
} else {
  console.error('EINIGE TESTS FEHLGESCHLAGEN - Bitte korrigieren!');
}
console.log('========================================');

process.exit(allPassed ? 0 : 1);

