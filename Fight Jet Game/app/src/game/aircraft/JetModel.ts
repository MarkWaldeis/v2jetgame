import * as THREE from 'three';

// ============================================================================
// F-16C Fighting Falcon — hochdetailliertes Prozedural-Modell (USAF)
// Konvention (Three.js Standard): Nase = -Z, Heck/Düse = +Z, Oben = +Y.
// Flugrichtung, Kanone und Chase-Kamera nutzen alle local -Z als Vorwärtsachse.
// ============================================================================

export interface F16Options {
  bodyColor: number;
  accentColor: number;
  nation: 'us' | 'enemy';
  withCockpit: boolean;
  tailCode?: string;
}

export interface F16Parts {
  group: THREE.Group;
  afterburner: THREE.Mesh;
  abLight: THREE.PointLight;
  cockpit?: THREE.Group;
}

// ---- Canvas-Texturen -------------------------------------------------------

function roundelTexture(nation: 'us' | 'enemy'): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d')!;
  const cx = 128, cy = 128;
  if (nation === 'us') {
    x.fillStyle = '#1c3d6e';
    x.fillRect(8, cy - 32, 240, 64);
    x.fillStyle = '#b5242c';
    x.fillRect(8, cy - 12, 70, 24);
    x.fillRect(178, cy - 12, 70, 24);
    x.fillStyle = '#f2f2f0';
    x.fillRect(70, cy - 32, 8, 64);
    x.fillRect(178, cy - 32, 8, 64);
    x.fillStyle = '#1c3d6e';
    x.beginPath(); x.arc(cx, cy, 78, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#f2f2f0';
    x.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * 4 * Math.PI) / 5;
      const px = cx + Math.cos(a) * 58, py = cy + Math.sin(a) * 58;
      i === 0 ? x.moveTo(px, py) : x.lineTo(px, py);
    }
    x.closePath(); x.fill();
  } else {
    x.fillStyle = '#8c1f1f';
    x.beginPath(); x.arc(cx, cy, 80, 0, Math.PI * 2); x.fill();
    x.strokeStyle = '#e8c23a'; x.lineWidth = 6;
    x.beginPath(); x.arc(cx, cy, 74, 0, Math.PI * 2); x.stroke();
    x.fillStyle = '#e8c23a';
    x.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * 4 * Math.PI) / 5;
      const px = cx + Math.cos(a) * 56, py = cy + Math.sin(a) * 56;
      i === 0 ? x.moveTo(px, py) : x.lineTo(px, py);
    }
    x.closePath(); x.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function panelTexture(base: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const x = c.getContext('2d')!;
  x.fillStyle = base;
  x.fillRect(0, 0, 512, 512);
  // Subtile Panel-Lines
  x.strokeStyle = 'rgba(0,0,0,0.11)';
  x.lineWidth = 1.4;
  for (let i = 0; i <= 16; i++) {
    x.beginPath(); x.moveTo(i * 32, 0); x.lineTo(i * 32, 512); x.stroke();
    x.beginPath(); x.moveTo(0, i * 32); x.lineTo(512, i * 32); x.stroke();
  }
  // Nieten
  x.fillStyle = 'rgba(0,0,0,0.08)';
  for (let i = 0; i < 420; i++) {
    x.beginPath();
    x.arc(Math.random() * 512, Math.random() * 512, 0.9, 0, Math.PI * 2);
    x.fill();
  }
  // Zugangsklappen
  x.strokeStyle = 'rgba(0,0,0,0.16)';
  x.lineWidth = 1.6;
  const bays = [
    [40, 60, 90, 40], [180, 40, 70, 50], [300, 80, 100, 36],
    [60, 200, 120, 45], [220, 220, 80, 60], [360, 180, 70, 40],
    [80, 340, 100, 50], [250, 360, 90, 40], [380, 320, 60, 55],
  ];
  for (const [bx, by, bw, bh] of bays) x.strokeRect(bx, by, bw, bh);
  // Leichter Schmutzverlauf
  const g = x.createLinearGradient(0, 0, 512, 512);
  g.addColorStop(0, 'rgba(255,255,255,0.04)');
  g.addColorStop(0.5, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.06)');
  x.fillStyle = g;
  x.fillRect(0, 0, 512, 512);

  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function tailTexture(code: string, accent: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const x = c.getContext('2d')!;
  x.clearRect(0, 0, 256, 256);
  // Farbstreifen oben
  x.fillStyle = accent;
  x.fillRect(0, 10, 256, 28);
  x.fillStyle = '#f2f2f0';
  x.fillRect(0, 38, 256, 8);
  x.fillStyle = accent;
  x.fillRect(0, 46, 256, 10);
  // Tailcode
  x.fillStyle = '#f2f2f0';
  x.font = 'bold 78px Arial';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(code, 128, 140);
  x.font = 'bold 28px Arial';
  x.fillText('USAF', 128, 200);
  x.font = 'bold 18px Arial';
  x.fillText('VIPER', 128, 230);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function mfdTexture(kind: 'radar' | 'engine'): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d')!;
  x.fillStyle = '#03140a';
  x.fillRect(0, 0, 128, 128);
  x.strokeStyle = '#2fe06a';
  x.fillStyle = '#2fe06a';
  x.lineWidth = 2;
  if (kind === 'radar') {
    x.beginPath(); x.arc(64, 64, 52, 0, Math.PI * 2); x.stroke();
    x.beginPath(); x.moveTo(64, 8); x.lineTo(64, 120); x.stroke();
    x.beginPath(); x.moveTo(8, 64); x.lineTo(120, 64); x.stroke();
    const g = x.createLinearGradient(64, 64, 120, 20);
    g.addColorStop(0, 'rgba(47,224,106,0.5)');
    g.addColorStop(1, 'rgba(47,224,106,0)');
    x.fillStyle = g;
    x.beginPath(); x.moveTo(64, 64); x.arc(64, 64, 52, -0.7, -0.1); x.closePath(); x.fill();
    x.fillStyle = '#ff4444';
    x.fillRect(84, 40, 5, 5); x.fillRect(40, 80, 5, 5);
  } else {
    x.font = 'bold 16px monospace';
    const rows = ['RPM  98%', 'EGT  612', 'FUEL 7400', 'OIL   OK', 'HYD   OK'];
    rows.forEach((r, i) => x.fillText(r, 10, 26 + i * 22));
    x.strokeRect(4, 4, 120, 120);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---- Hilfsfunktionen -------------------------------------------------------

function makeMat(
  color: number,
  opts: { map?: THREE.Texture; metalness?: number; roughness?: number; emissiveIntensity?: number; side?: THREE.Side } = {}
) {
  return new THREE.MeshStandardMaterial({
    color,
    map: opts.map,
    metalness: opts.metalness ?? 0.1,
    roughness: opts.roughness ?? 0.55,
    emissive: color,
    emissiveIntensity: opts.emissiveIntensity ?? 0.05,
    side: opts.side ?? THREE.FrontSide,
  });
}

/** AIM-9 Sidewinder an Flügelspitze — Nase zeigt nach -Z (Flugrichtung). */
function buildAim9(accentMat: THREE.Material, darkMat: THREE.Material): THREE.Group {
  const m = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.0, 10), accentMat);
  body.rotation.x = Math.PI / 2;
  m.add(body);
  // Seeker-Nase (vorne = -Z)
  const seeker = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), darkMat);
  seeker.position.z = -1.05;
  m.add(seeker);
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(0.085, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.6, roughness: 0.2 })
  );
  dome.rotation.x = Math.PI;
  dome.position.z = -1.12;
  m.add(dome);
  // Canards vorne
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.02, 0.22), darkMat);
    fin.position.set(Math.cos(a) * 0.12, Math.sin(a) * 0.12, -0.55);
    fin.rotation.z = a;
    m.add(fin);
  }
  // Heckflossen
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.02, 0.28), darkMat);
    fin.position.set(Math.cos(a) * 0.12, Math.sin(a) * 0.12, 0.75);
    fin.rotation.z = a;
    m.add(fin);
  }
  // Rolleron-Hints
  const rear = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.06, 0.25, 8), darkMat);
  rear.rotation.x = Math.PI / 2;
  rear.position.z = 1.05;
  m.add(rear);
  return m;
}

// ---- Hauptmodell -----------------------------------------------------------

export function buildF16(opts: F16Options): F16Parts {
  const g = new THREE.Group();
  const isUS = opts.nation === 'us';

  const skin = panelTexture('#f0f2f4');
  const bodyMat = makeMat(opts.bodyColor, { map: skin, metalness: 0.12, roughness: 0.52, emissiveIntensity: 0.06, side: THREE.DoubleSide });
  const darkMat = makeMat(0x2a2e36, { metalness: 0.35, roughness: 0.55, emissiveIntensity: 0.03 });
  const metalMat = makeMat(0x4a5058, { metalness: 0.65, roughness: 0.35, emissiveIntensity: 0.02 });
  const accentMat = makeMat(opts.accentColor, { metalness: 0.2, roughness: 0.5, emissiveIntensity: 0.1 });
  const canopyMat = new THREE.MeshPhysicalMaterial({
    color: 0x1a2838,
    metalness: 0.4,
    roughness: 0.08,
    transparent: true,
    opacity: 0.42,
    transmission: 0.22,
    thickness: 0.35,
    side: THREE.DoubleSide,
  });

  // =========================================================================
  // RUMPF — Lathe-Profil (echtes F-16-Silhouette: spitze Nase, bauchiger
  // Mittelteil, enger Düsenübergang). Achse Y → dann nach -Z drehen.
  // Gesamtlänge ~15 m: z von -7.5 (Nase) bis +7.5 (Düse).
  // =========================================================================
  const profile: [number, number][] = [
    [0.00, 0.00],   // Nose tip
    [0.18, 0.35],
    [0.38, 0.85],   // Radome
    [0.52, 1.45],
    [0.62, 2.10],   // hinter Radome
    [0.72, 3.20],   // Cockpit-Beginn
    [0.82, 4.40],
    [0.92, 5.60],   // breitester Bereich (Intake/Wing root)
    [0.96, 7.00],
    [0.94, 8.40],
    [0.88, 10.0],
    [0.78, 11.6],   // Verjüngung
    [0.68, 13.0],
    [0.60, 14.0],   // vor Düse
    [0.58, 14.6],
    [0.55, 15.0],   // Düsenlippe
  ];
  const lathePts = profile.map(([r, y]) => new THREE.Vector2(r, y));
  const fuselageGeo = new THREE.LatheGeometry(lathePts, 28);
  // Y-up Lathe → nach rotX(+90°) liegt die Achse auf +Z (Nase y=0 → z=0, Heck z=+15).
  // Verschieben: Nase bei z=-7.5, Heck/Düse bei z=+7.5 (Flugrichtung = -Z).
  fuselageGeo.rotateX(Math.PI / 2);
  fuselageGeo.translate(0, 0, -7.5);
  // Leicht oval (F-16 Rumpf breiter als hoch im Mittelteil)
  const fuselage = new THREE.Mesh(fuselageGeo, bodyMat);
  fuselage.scale.set(1.05, 0.88, 1);
  g.add(fuselage);

  // Dunkler Radome-Überzug (vordere Nase)
  const radome = new THREE.Mesh(new THREE.SphereGeometry(0.55, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), darkMat);
  radome.rotation.x = Math.PI / 2;
  radome.position.set(0, -0.02, -6.85);
  radome.scale.set(1.05, 1.15, 1.3);
  g.add(radome);

  // Pitotrohr (unter der Nase, leicht links — F-16-typisch)
  const pitot = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.012, 1.35, 6), metalMat);
  pitot.rotation.x = Math.PI / 2;
  pitot.position.set(-0.08, -0.22, -7.85);
  g.add(pitot);
  const pitotTip = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.12, 6), metalMat);
  pitotTip.rotation.x = -Math.PI / 2;
  pitotTip.position.set(-0.08, -0.22, -8.55);
  g.add(pitotTip);

  // =========================================================================
  // BAUCHEINLASS (F-16 Chin Intake) — markantes Merkmal von vorne/hinten
  // =========================================================================
  const intakeGroup = new THREE.Group();
  // Haupteinlass-Tunnel
  const intakeBody = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.58, 2.8), darkMat);
  intakeBody.position.set(0, -0.78, -1.2);
  intakeGroup.add(intakeBody);
  // Lippenrundung vorne
  const lip = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.07, 10, 20, Math.PI), darkMat);
  lip.position.set(0, -0.78, -2.55);
  lip.rotation.z = Math.PI;
  lip.scale.set(1.35, 0.85, 1);
  intakeGroup.add(lip);
  // Splitter-Plate (F-16 hat Boundary-Layer-Splitter)
  const splitter = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.04, 1.6), metalMat);
  splitter.position.set(0, -0.48, -1.8);
  intakeGroup.add(splitter);
  // Einlass-Duct-Öffnung (dunkles Loch)
  const duct = new THREE.Mesh(
    new THREE.CircleGeometry(0.38, 16),
    new THREE.MeshBasicMaterial({ color: 0x050608 })
  );
  duct.position.set(0, -0.78, -2.58);
  intakeGroup.add(duct);
  g.add(intakeGroup);

  // =========================================================================
  // LERX / STRAKES (Leading-Edge Root Extensions) — F-16-Silhouette
  // =========================================================================
  for (const side of [-1, 1] as const) {
    const lerxShape = new THREE.Shape();
    lerxShape.moveTo(0, 0);
    lerxShape.lineTo(side * 0.15, 0);
    lerxShape.lineTo(side * 0.95, 2.8);
    lerxShape.lineTo(side * 0.55, 3.6);
    lerxShape.lineTo(0, 3.4);
    lerxShape.closePath();
    const lerxGeo = new THREE.ExtrudeGeometry(lerxShape, { depth: 0.08, bevelEnabled: false });
    lerxGeo.rotateX(Math.PI / 2);
    const lerx = new THREE.Mesh(lerxGeo, bodyMat);
    lerx.position.set(0, 0.05, -4.2);
    g.add(lerx);
  }

  // =========================================================================
  // BUBBLE CANOPY + Rahmen (F-16: große einteilige Haube)
  // =========================================================================
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.78, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.55), canopyMat);
  canopy.position.set(0, 0.55, -2.85);
  canopy.scale.set(0.78, 0.72, 1.85);
  g.add(canopy);

  // Canopy-Rahmen (dunkel)
  const frameMat = darkMat;
  const bow = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.03, 8, 24, Math.PI), frameMat);
  bow.position.set(0, 0.58, -4.0);
  bow.scale.set(0.92, 1.0, 1);
  g.add(bow);
  const bowMid = bow.clone();
  bowMid.position.z = -2.85;
  bowMid.scale.set(1.0, 1.05, 1);
  g.add(bowMid);
  const bowRear = bow.clone();
  bowRear.position.z = -1.7;
  bowRear.scale.set(0.95, 0.95, 1);
  g.add(bowRear);
  // Seitliche Schienen
  for (const side of [-1, 1] as const) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 2.5), frameMat);
    rail.position.set(side * 0.58, 0.42, -2.85);
    rail.rotation.z = side * 0.35;
    g.add(rail);
  }

  // Pilot (sichtbar durch Canopy)
  const pilot = new THREE.Group();
  const suit = new THREE.MeshStandardMaterial({ color: isUS ? 0x3a4a38 : 0x4a3a3a, roughness: 0.85 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.38, 4, 10), suit);
  torso.position.y = 0.22;
  pilot.add(torso);
  const helmet = new THREE.Mesh(
    new THREE.SphereGeometry(0.15, 14, 10),
    new THREE.MeshStandardMaterial({ color: 0xe6e6e2, roughness: 0.35, metalness: 0.15 })
  );
  helmet.position.y = 0.55;
  pilot.add(helmet);
  const visor = new THREE.Mesh(
    new THREE.SphereGeometry(0.135, 12, 8, -Math.PI / 3, Math.PI / 1.5, Math.PI / 4, Math.PI / 2.4),
    new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.08, metalness: 0.7 })
  );
  visor.position.set(0, 0.55, -0.03);
  visor.rotation.y = Math.PI;
  pilot.add(visor);
  // Sauerstoffschlauch-Hint
  const hose = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.015, 6, 12, Math.PI), darkMat);
  hose.position.set(0.12, 0.38, -0.05);
  hose.rotation.y = Math.PI / 2;
  pilot.add(hose);
  pilot.position.set(0, 0.38, -2.7);
  g.add(pilot);

  // =========================================================================
  // TRAGFÄCHEN — Cropped-Delta der F-16 (stark gepfeilt, abgeschnittene Spitze)
  // =========================================================================
  const wingShape = new THREE.Shape();
  // Root vorne → Tip vorne → Tip hinten → Root hinten (Draufsicht, X nach außen, Y nach hinten)
  wingShape.moveTo(0.2, 0.0);       // root LE
  wingShape.lineTo(4.7, 2.55);      // tip LE (starke Pfeilung)
  wingShape.lineTo(4.7, 3.85);      // tip TE (cropped)
  wingShape.lineTo(0.2, 4.55);      // root TE
  wingShape.closePath();
  const wingGeo = new THREE.ExtrudeGeometry(wingShape, {
    depth: 0.11,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.03,
    bevelSegments: 2,
  });
  wingGeo.rotateX(Math.PI / 2);

  const roundel = roundelTexture(opts.nation);
  const decalMat = new THREE.MeshBasicMaterial({
    map: roundel, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2,
  });

  for (const side of [-1, 1] as const) {
    const wing = new THREE.Mesh(wingGeo, bodyMat);
    wing.scale.x = side;
    // Leichter Anhedral (F-16 ~0 aber Flügel leicht tief)
    wing.rotation.z = side * -0.04;
    wing.position.set(0, -0.08, -1.55);
    g.add(wing);

    // Leading-Edge Flap-Linie
    const leFlap = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, 3.6), darkMat);
    leFlap.position.set(side * 2.4, -0.02, -0.55);
    leFlap.rotation.y = side * 0.48;
    g.add(leFlap);

    // Flaperon (Hinterkante)
    const flaperon = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.04, 0.45), bodyMat);
    flaperon.position.set(side * 2.6, -0.1, 1.55);
    g.add(flaperon);

    // USAF-Roundel oben
    const decal = new THREE.Mesh(new THREE.PlaneGeometry(1.55, 1.55), decalMat);
    decal.rotation.x = -Math.PI / 2;
    decal.position.set(side * 2.7, 0.02, 0.35);
    g.add(decal);
    // Kleineres Roundel unten
    const decalBot = decal.clone();
    decalBot.rotation.x = Math.PI / 2;
    decalBot.position.y = -0.14;
    decalBot.scale.setScalar(0.7);
    g.add(decalBot);

    // Missile rail + AIM-9 (Spitze zeigt nach -Z = Flugrichtung)
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 1.9), darkMat);
    rail.position.set(side * 4.7, 0.0, 0.15);
    g.add(rail);
    const aim9 = buildAim9(accentMat, darkMat);
    aim9.position.set(side * 4.7, -0.14, 0.1);
    g.add(aim9);

    // Nav-Lights: Port rot / Starboard grün an der Tip
    const nav = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 8, 8),
      new THREE.MeshBasicMaterial({ color: side < 0 ? 0xff2020 : 0x20ff40 })
    );
    nav.position.set(side * 4.72, 0.04, 0.9);
    g.add(nav);
  }

  // Unterrumpf-Pylon + Centerline-Tank (F-16-Look von unten/hinten)
  const clPylon = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.25, 1.4), darkMat);
  clPylon.position.set(0, -0.95, 0.6);
  g.add(clPylon);
  const dropTank = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 2.4, 6, 12), bodyMat);
  dropTank.rotation.x = Math.PI / 2;
  dropTank.position.set(0, -1.2, 0.5);
  g.add(dropTank);

  // Unterflügel-Pylone + AIM-120-Andeutung
  for (const side of [-1, 1] as const) {
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 1.2), darkMat);
    pylon.position.set(side * 2.4, -0.35, 0.2);
    g.add(pylon);
    const amraam = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 2.0, 4, 8), darkMat);
    amraam.rotation.x = Math.PI / 2;
    amraam.position.set(side * 2.4, -0.55, 0.15);
    g.add(amraam);
    const amNose = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.35, 8), darkMat);
    amNose.rotation.x = -Math.PI / 2;
    amNose.position.set(side * 2.4, -0.55, -1.05);
    g.add(amNose);
  }

  // =========================================================================
  // SEITENLEITWERK (YZ-Ebene: dünn in X, Sehne entlang Z, Höhe Y)
  // =========================================================================
  const finShape = new THREE.Shape();
  // Shape-X = Sehne (vorne→hinten), Shape-Y = Höhe
  finShape.moveTo(0, 0);           // LE root
  finShape.lineTo(0.15, 3.2);      // LE tip
  finShape.lineTo(1.45, 2.6);      // TE tip
  finShape.lineTo(1.95, 0.1);      // TE root
  finShape.lineTo(1.5, 0);
  finShape.closePath();
  const finGeo = new THREE.ExtrudeGeometry(finShape, {
    depth: 0.11, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.015, bevelSegments: 1,
  });
  // Shape XY, Extrude +Z → rotY(+90°): Sehne liegt auf -Z (Nase), Dicke auf X
  finGeo.rotateY(Math.PI / 2);
  // Nach rotY: Sehne 0..2 → z 0..-2. Verschieben ans Heck, LE etwas weiter vorne
  finGeo.translate(0, 0, 5.5);
  const fin = new THREE.Mesh(finGeo, bodyMat);
  fin.position.set(0, 0.38, 0);
  g.add(fin);

  // Ruder (Rudder) am hinteren Teil des Leitwerks
  const rudder = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.7, 0.5), bodyMat);
  rudder.position.set(0, 1.55, 5.35);
  g.add(rudder);

  // Base fairing am Leitwerksfuß
  const finBase = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.32, 1.9), bodyMat);
  finBase.position.set(0, 0.48, 4.35);
  g.add(finBase);

  if (isUS) {
    const tailMap = tailTexture(opts.tailCode ?? 'SW', '#b5242c');
    const tailMat = new THREE.MeshBasicMaterial({
      map: tailMap, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, side: THREE.DoubleSide,
    });
    const tailArt = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.45), tailMat);
    tailArt.position.set(0.09, 1.9, 4.7);
    tailArt.rotation.y = Math.PI / 2;
    g.add(tailArt);
    const tailArt2 = tailArt.clone();
    tailArt2.position.x = -0.09;
    tailArt2.rotation.y = -Math.PI / 2;
    g.add(tailArt2);
  } else {
    const star = new THREE.Mesh(
      new THREE.CircleGeometry(0.35, 5),
      new THREE.MeshBasicMaterial({ color: 0xc9a227, side: THREE.DoubleSide })
    );
    star.position.set(0.09, 1.95, 4.6);
    star.rotation.y = Math.PI / 2;
    g.add(star);
  }

  // Anti-Collision Beacon (oben am Leitwerk)
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xff2200 })
  );
  beacon.position.set(0, 3.55, 4.5);
  g.add(beacon);

  // =========================================================================
  // HÖHENLEITWERKE (all-moving stabs, Anhedral, F-16-Form)
  // =========================================================================
  const stabShape = new THREE.Shape();
  stabShape.moveTo(0, 0);
  stabShape.lineTo(2.15, 0.55);
  stabShape.lineTo(2.15, 1.35);
  stabShape.lineTo(0.15, 1.55);
  stabShape.closePath();
  const stabGeo = new THREE.ExtrudeGeometry(stabShape, { depth: 0.08, bevelEnabled: false });
  stabGeo.rotateX(Math.PI / 2);
  for (const side of [-1, 1] as const) {
    const stab = new THREE.Mesh(stabGeo, bodyMat);
    stab.scale.x = side;
    stab.position.set(side * 0.35, 0.08, 4.85);
    stab.rotation.z = side * -0.18; // Anhedral
    g.add(stab);
  }

  // =========================================================================
  // VENTRALE FINNEN (F-16-Markenzeichen von hinten!)
  // =========================================================================
  for (const side of [-1, 1] as const) {
    const vFinShape = new THREE.Shape();
    vFinShape.moveTo(0, 0);
    vFinShape.lineTo(0.05, -0.65);
    vFinShape.lineTo(1.15, -0.45);
    vFinShape.lineTo(1.2, 0);
    vFinShape.closePath();
    const vGeo = new THREE.ExtrudeGeometry(vFinShape, { depth: 0.05, bevelEnabled: false });
    const vFin = new THREE.Mesh(vGeo, bodyMat);
    vFin.position.set(side * 0.35, -0.35, 4.5);
    vFin.rotation.z = side * 0.42;
    g.add(vFin);
  }

  // =========================================================================
  // M61 VULCAN GUN — links im Strake, Mündung zeigt nach -Z (Flugrichtung)
  // =========================================================================
  const gunGroup = new THREE.Group();
  // Fairing-Bulge
  const gunBulge = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), bodyMat);
  gunBulge.scale.set(1.4, 0.7, 1.8);
  gunBulge.position.set(-0.78, 0.22, -2.4);
  gunGroup.add(gunBulge);
  // Mündung (sichtbarer Port nach vorne)
  const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.35, 10), darkMat);
  muzzle.rotation.x = Math.PI / 2;
  muzzle.position.set(-0.78, 0.22, -3.15);
  gunGroup.add(muzzle);
  const muzzleHole = new THREE.Mesh(
    new THREE.CircleGeometry(0.04, 10),
    new THREE.MeshBasicMaterial({ color: 0x050505 })
  );
  muzzleHole.position.set(-0.78, 0.22, -3.33);
  gunGroup.add(muzzleHole);
  g.add(gunGroup);

  // =========================================================================
  // DETAILS: Antennen, Formation Lights, AOA-Probe
  // =========================================================================
  // Blade antennas
  const blade1 = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.32, 0.16), darkMat);
  blade1.position.set(0, 0.92, 1.0);
  g.add(blade1);
  const blade2 = blade1.clone();
  blade2.position.set(0.15, 0.85, 3.2);
  blade2.scale.set(0.8, 0.75, 0.8);
  g.add(blade2);
  // AOA-Probe rechts an der Nase
  const aoa = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.35, 6), metalMat);
  aoa.rotation.z = Math.PI / 2;
  aoa.position.set(0.55, 0.15, -5.5);
  g.add(aoa);

  // Formation lights (strip lights an den Seiten)
  const formMat = new THREE.MeshBasicMaterial({ color: 0x9fe8b0 });
  for (const side of [-1, 1] as const) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.05, 1.8), formMat);
    strip.position.set(side * 0.95, 0.12, -1.5);
    g.add(strip);
  }
  // Static dischargers an Flügelspitzen
  for (const side of [-1, 1] as const) {
    const wick = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.25, 4), darkMat);
    wick.rotation.z = side * Math.PI / 2;
    wick.position.set(side * 4.85, 0, 0.95);
    g.add(wick);
  }

  // =========================================================================
  // TRIEBWERK / DÜSE — von hinten das markanteste Feature
  // =========================================================================
  // Exhaust fairing
  const nozzleFairing = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.72, 1.5, 20), darkMat);
  nozzleFairing.rotation.x = Math.PI / 2;
  nozzleFairing.position.set(0, -0.02, 6.55);
  g.add(nozzleFairing);

  // Innere Düse (dunkler)
  const innerNozzle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.48, 0.52, 0.8, 16),
    new THREE.MeshStandardMaterial({ color: 0x1a1c20, metalness: 0.5, roughness: 0.4 })
  );
  innerNozzle.rotation.x = Math.PI / 2;
  innerNozzle.position.set(0, -0.02, 7.1);
  g.add(innerNozzle);

  // Turbine-Face (sichtbar in die Düse)
  const turbine = new THREE.Mesh(
    new THREE.CircleGeometry(0.45, 16),
    new THREE.MeshStandardMaterial({ color: 0x2a3040, metalness: 0.7, roughness: 0.3 })
  );
  turbine.position.set(0, -0.02, 6.7);
  g.add(turbine);
  // Fan-Blades-Hint
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.38, 0.02), metalMat);
    blade.position.set(Math.cos(a) * 0.18, Math.sin(a) * 0.18 - 0.02, 6.72);
    blade.rotation.z = a;
    g.add(blade);
  }

  // Turkey feathers (variable nozzle petals) — F-16 von hinten!
  const featherCount = 14;
  for (let i = 0; i < featherCount; i++) {
    const a = (i / featherCount) * Math.PI * 2;
    const feather = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.045, 0.55),
      new THREE.MeshStandardMaterial({ color: 0x3a3e48, metalness: 0.55, roughness: 0.4 })
    );
    const r = 0.62;
    feather.position.set(Math.cos(a) * r, Math.sin(a) * r - 0.02, 7.35);
    feather.rotation.z = a;
    // Leicht nach innen gekippt
    feather.rotation.y = Math.cos(a) * 0.15;
    feather.rotation.x = Math.sin(a) * 0.15;
    g.add(feather);
  }

  // =========================================================================
  // NACHBRENNER
  // =========================================================================
  const abMat = new THREE.MeshBasicMaterial({
    color: 0x66aaff, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const afterburner = new THREE.Mesh(new THREE.ConeGeometry(0.52, 4.6, 14, 1, true), abMat);
  afterburner.rotation.x = Math.PI / 2;
  afterburner.position.set(0, -0.02, 9.5);
  afterburner.visible = false;
  g.add(afterburner);

  const diamonds = new THREE.Mesh(
    new THREE.ConeGeometry(0.28, 2.8, 8, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xffcc88, transparent: true, opacity: 0.7,
      blending: THREE.AdditiveBlending, depthWrite: false,
    })
  );
  diamonds.rotation.x = Math.PI / 2;
  diamonds.position.set(0, 0, -0.5);
  diamonds.name = 'abDiamonds';
  afterburner.add(diamonds);

  const abLight = new THREE.PointLight(0x77aaff, 0, 35);
  abLight.position.set(0, 0, 8.0);
  g.add(abLight);

  const parts: F16Parts = { group: g, afterburner, abLight };
  if (opts.withCockpit) {
    parts.cockpit = buildCockpit();
    g.add(parts.cockpit);
  }
  return parts;
}

// ---- Cockpit-Interior ------------------------------------------------------

function buildCockpit(): THREE.Group {
  const c = new THREE.Group();
  c.position.y = 0.22;
  const tubMat = new THREE.MeshStandardMaterial({ color: 0x24262a, roughness: 0.85 });
  const panelMat = new THREE.MeshStandardMaterial({ color: 0x1a1c1f, roughness: 0.7 });

  const tub = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.5, 2.0), tubMat);
  tub.position.set(0, 0.12, -2.75);
  c.add(tub);

  const seatMat = new THREE.MeshStandardMaterial({ color: 0x333539, roughness: 0.8 });
  const seatBack = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.62, 0.12), seatMat);
  seatBack.position.set(0, 0.42, -2.05);
  seatBack.rotation.x = 0.18;
  c.add(seatBack);
  const headrest = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.2, 0.14), seatMat);
  headrest.position.set(0, 0.78, -2.0);
  c.add(headrest);

  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.5, 0.08), panelMat);
  panel.position.set(0, 0.48, -3.65);
  panel.rotation.x = -0.28;
  c.add(panel);

  const mfdRadar = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.26),
    new THREE.MeshBasicMaterial({ map: mfdTexture('radar') })
  );
  mfdRadar.position.set(-0.28, 0.48, -3.60);
  mfdRadar.rotation.x = -0.28;
  c.add(mfdRadar);
  const mfdEngine = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.26),
    new THREE.MeshBasicMaterial({ map: mfdTexture('engine') })
  );
  mfdEngine.position.set(0.28, 0.48, -3.60);
  mfdEngine.rotation.x = -0.28;
  c.add(mfdEngine);

  const hudBox = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.14), panelMat);
  hudBox.position.set(0, 0.72, -3.55);
  c.add(hudBox);
  const hudGlass = new THREE.Mesh(
    new THREE.PlaneGeometry(0.2, 0.16),
    new THREE.MeshPhysicalMaterial({
      color: 0x88ffbb, transparent: true, opacity: 0.18, roughness: 0.05, side: THREE.DoubleSide,
    })
  );
  hudGlass.position.set(0, 0.86, -3.58);
  hudGlass.rotation.x = -0.15;
  c.add(hudGlass);

  const glare = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.06, 0.3), tubMat);
  glare.position.set(0, 0.78, -3.5);
  glare.rotation.x = -0.2;
  c.add(glare);

  // F-16 Sidestick rechts
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.22, 8), panelMat);
  stick.position.set(0.42, 0.28, -2.8);
  stick.rotation.z = -0.15;
  c.add(stick);
  const throttle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.2), panelMat);
  throttle.position.set(-0.42, 0.3, -2.85);
  c.add(throttle);
  for (const side of [-1, 1] as const) {
    const console = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 1.3), panelMat);
    console.position.set(side * 0.44, 0.26, -2.9);
    c.add(console);
  }
  return c;
}

// ---- Wingtip-Contrails -----------------------------------------------------

export class Contrails {
  readonly group = new THREE.Group();
  private trails: { mesh: THREE.Mesh; tipOffset: THREE.Vector3 }[] = [];
  private jet: THREE.Object3D;

  constructor(jet: THREE.Object3D, halfSpan = 4.7) {
    this.jet = jet;
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false,
    });
    for (const side of [-halfSpan, halfSpan]) {
      const geo = new THREE.CylinderGeometry(0.06, 0.5, 26, 6, 1, true);
      geo.rotateX(Math.PI / 2);
      geo.translate(0, 0, 13);
      const mesh = new THREE.Mesh(geo, mat);
      this.group.add(mesh);
      this.trails.push({ mesh, tipOffset: new THREE.Vector3(side, 0, 0.2) });
    }
  }

  update(_dt: number, speed: number, gForce: number) {
    const visible = speed > 220 && gForce > 1.4;
    this.group.visible = visible;
    if (!visible) return;
    for (const t of this.trails) {
      const world = t.tipOffset.clone().applyMatrix4(this.jet.matrixWorld);
      t.mesh.position.copy(world);
      t.mesh.quaternion.copy(this.jet.quaternion);
    }
  }
}
