// Katalog fliegbarer Jets: NATO & Russland/Sowjet.
// WWII-Props / MiG-15 sind archiviert unter archived-aircraft/legacy-props/.
import * as THREE from 'three';
import type { ModelOrient } from './GlbJetLoader';

export type JetFaction = 'nato' | 'russia';

export type JetId =
  | 'f16'
  | 'f35'
  | 'elite'
  | 'f14'
  | 'l39'
  | 'su25'
  | 'su34'
  | 'su57';

/** Antrieb / Epoche — steuert Sound, Nachbrenner, Propeller-FX, Windanfälligkeit. */
export type EngineType = 'jet' | 'piston';
export type AircraftEra = 'modern' | 'early_jet' | 'propeller';

/**
 * Visuelle Ankerpunkte am normalisierten Modell (lokal, Nase = -Z, Heck = +Z).
 * Werden zur Laufzeit per Bounding-Box nachkalibriert (FxAnchors).
 */
export interface JetFxSpec {
  nozzles: [number, number, number][];
  nozzleScale: number;
  muzzles: [number, number, number][];
  /** Sichtbare Waffenstationen, exakt im normalisierten GLB-Raum kalibriert. */
  hardpoints: [number, number, number][];
  wingHalfSpan: number;
}

/**
 * Differenziertes Flugmodell (relativ zu CONFIG.flight).
 * Propeller & Early Jets: träger, mehr Drag, Stall, Torque, Wind.
 */
export interface FlightPhysicsProfile {
  /** Parasitärer Widerstand (1 = F-16) */
  dragMult: number;
  /** Induzierter Widerstand / Energy Bleed in Kurven */
  inducedDragMult: number;
  /** Schub / Beschleunigung */
  thrustMult: number;
  /** Nachbrenner / WEP erlaubt */
  hasAfterburner: boolean;
  /** Propeller-Drehmoment: Roll-Tendenz bei Vollgas (rad/s @ throttle 1) */
  torqueRoll: number;
  /** P-Faktor: leichter Yaw-Zug bei Vollgas (rad/s) */
  pFactorYaw: number;
  /** 0 = modern stabil, 1–2 = leichte Propellerzelle (Wind + Flutter) */
  windSusceptibility: number;
  /** Stall-Schwelle relativ (höher = früher Stall) */
  stallSpeedMult: number;
  /** Stärkerer Nase-Drop im Stall */
  stallDropMult: number;
  /** Ziel-Rumpflänge beim Laden (m) — Props sind kleiner */
  modelLengthM?: number;
}

export interface JetDef {
  id: JetId;
  faction: JetFaction;
  name: string;
  callsign: string;
  role: string;
  description: string;
  modelUrl: string;
  /** Preis in Aero Credits (AC) */
  price: number;
  /**
   * GLB-Orientierungskorrektur (Nase = local −Z).
   * z. B. Su-57: Asset schaut nach Auto-Align falsch herum → yawDeg: 180
   */
  modelOrient?: ModelOrient;
  traits: string[];
  era: AircraftEra;
  engineType: EngineType;
  physics: FlightPhysicsProfile;
  stats: {
    hp: number;
    /** Multiplikator auf max/cruise/AB-Speed (1.0 = Basis F-16) */
    speedMult: number;
    /** Multiplikator auf Pitch/Roll/Yaw */
    turnMult: number;
    cannonDamage: number;
    cannonRPM: number;
    cannonSpread: number;
    missiles: number;
    lockRange: number;
    lockTime: number;
    lockAngleDeg: number;
    flareCount: number;
  };
  special: {
    id: string;
    label: string;
    detail: string;
  };
  fx: JetFxSpec;
}

/** Standard-Physik moderner Jets */
export const MODERN_JET_PHYSICS: FlightPhysicsProfile = {
  dragMult: 1,
  inducedDragMult: 1,
  thrustMult: 1,
  hasAfterburner: true,
  torqueRoll: 0,
  pFactorYaw: 0,
  /** Spürbarer Wind (Rollen/Gieren/Drift), aber noch spielbar */
  windSusceptibility: 0.42,
  stallSpeedMult: 1,
  stallDropMult: 1,
  modelLengthM: 15.5,
};

const singleNozzle = (
  y = -0.4,
  z = 7.0,
  scale = 1,
  wing = 6.2,
  hardpoints: [number, number, number][] = []
): JetFxSpec => ({
  nozzles: [[0, y, z]],
  nozzleScale: scale,
  muzzles: [[-0.5, -0.2, -6.8]],
  hardpoints,
  wingHalfSpan: wing,
});

const twinNozzle = (
  x = 0.9,
  y = -0.5,
  z = 7.0,
  scale = 0.9,
  wing = 7.0,
  hardpoints: [number, number, number][] = []
): JetFxSpec => ({
  nozzles: [
    [-x, y, z],
    [x, y, z],
  ],
  nozzleScale: scale,
  muzzles: [
    [-0.55, -0.15, -6.5],
    [0.55, -0.15, -6.5],
  ],
  hardpoints,
  wingHalfSpan: wing,
});

export const JET_CATALOG: JetDef[] = [
  // ─── NATO ───────────────────────────────────────────────────────────────
  {
    id: 'f16',
    faction: 'nato',
    name: 'F-16 Fighting Falcon',
    callsign: 'VIPER 01',
    role: 'Multirole · Ausgewogen',
    description:
      'Der agile Multirole-Klassiker. Gute Wendigkeit, M61 Vulcan und Sidewinder. Ideal zum Einsteigen.',
    modelUrl: './models/player-jet.glb',
    price: 0,
    traits: ['Wendig', 'Vulcan', '6× AIM-9'],
    era: 'modern',
    engineType: 'jet',
    physics: { ...MODERN_JET_PHYSICS },
    stats: {
      hp: 100,
      speedMult: 1.0, // ~Mach 2 real, Basis
      turnMult: 1.1,
      cannonDamage: 4,
      cannonRPM: 3000,
      cannonSpread: 0.012,
      missiles: 6,
      lockRange: 2500,
      lockTime: 1.35,
      lockAngleDeg: 18,
      flareCount: 0, // Flares nur auf Top-Tier (Elite / Su-57)
    },
    special: {
      id: 'vulcan',
      label: 'M61 Vulcan',
      detail: 'Hohe Feuerrate, präzise Dogfight-Kanone',
    },
    // y auf -0.05 gesetzt (Zentrum nahe Düsenebene, wie in Aircraft‑Konstruktor)
    fx: singleNozzle(-0.05, 7.42, 0.95, 6.5, [
      [-3.0, -0.4, -1.5], [3.0, -0.4, -1.5],   // Wingtip
      [-2.2, -0.45, -1.2], [2.2, -0.45, -1.2],  // Mid-wing
      [-1.4, -0.5, -0.8], [1.4, -0.5, -0.8],    // Inner wing
    ]),
  },
  {
    id: 'f35',
    faction: 'nato',
    name: 'F-35 Lightning II',
    callsign: 'GHOST 07',
    role: 'Stealth · BVR',
    description:
      'Tarnkappen-Jäger der 5. Generation. Starke Sensoren und BVR-Raketen, in engen Kurven etwas träger.',
    modelUrl: './models/f35.glb',
    price: 1800,
    traits: ['Stealth', 'BVR-Lock', '8× AMRAAM'],
    era: 'modern',
    engineType: 'jet',
    physics: { ...MODERN_JET_PHYSICS, windSusceptibility: 0.2 },
    stats: {
      hp: 130,
      speedMult: 1.02, // ~Mach 1.6
      turnMult: 0.9,
      cannonDamage: 3.5,
      cannonRPM: 2400,
      cannonSpread: 0.01,
      missiles: 8,
      lockRange: 3800,
      lockTime: 0.85,
      lockAngleDeg: 22,
      flareCount: 0,
    },
    special: {
      id: 'amraam',
      label: 'AMRAAM Suite',
      detail: 'Schneller Lock, große Reichweite',
    },
    fx: singleNozzle(-0.1, 7.00, 1.0, 6.3, [
      [-2.9, -0.35, -1.4], [2.9, -0.35, -1.4],
      [-2.1, -0.4, -1.1], [2.1, -0.4, -1.1],
      [-1.3, -0.45, -0.7], [1.3, -0.45, -0.7],
      [-0.6, -0.55, -0.3], [0.6, -0.55, -0.3],
    ]),
  },
  {
    id: 'f14',
    faction: 'nato',
    name: 'F-14B Tomcat',
    callsign: 'TOMCAT 2',
    role: 'Interceptor · Fleet Defense',
    description:
      'Navy-Legende mit Schwenkflügeln und AIM-54 Phoenix. Sehr schnell in gerader Linie, schwer und träge in engen Turns.',
    modelUrl: './models/f14.glb',
    price: 2500,
    traits: ['Phoenix BVR', 'Twin TF30', 'Carrier'],
    era: 'modern',
    engineType: 'jet',
    physics: { ...MODERN_JET_PHYSICS, modelLengthM: 18.5 },
    stats: {
      hp: 125,
      speedMult: 1.18, // ~Mach 2.3+
      turnMult: 0.78,
      cannonDamage: 4.2,
      cannonRPM: 2800,
      cannonSpread: 0.011,
      missiles: 6,
      lockRange: 4200,
      lockTime: 1.0,
      lockAngleDeg: 16,
      flareCount: 0,
    },
    special: {
      id: 'phoenix',
      label: 'AIM-54 Phoenix',
      detail: 'Lange BVR-Reichweite, starke Raketen',
    },
    fx: twinNozzle(1.05, -0.48, 6.72, 0.9, 8.5, [
      [-3.9, -0.45, -2.0], [3.9, -0.45, -2.0],
      [-2.9, -0.5, -1.5], [2.9, -0.5, -1.5],
      [-1.9, -0.55, -1.2], [1.9, -0.55, -1.2],
    ]),
  },
  {
    id: 'l39',
    faction: 'nato',
    name: 'L-39ZA Albatros',
    callsign: 'ALBA 4',
    role: 'Trainer · Light Attack',
    description:
      'Leichter Trainer/Angriffsjet. Langsam, aber wendig und übersichtlich — gut für Anfänger und Bodenziele.',
    modelUrl: './models/l39.glb',
    price: 1200,
    traits: ['Wendig', 'Leicht', 'CAS-Light'],
    era: 'modern',
    engineType: 'jet',
    physics: {
      ...MODERN_JET_PHYSICS,
      hasAfterburner: false,
      thrustMult: 0.85,
      dragMult: 1.1,
      windSusceptibility: 0.55,
      modelLengthM: 12.2,
    },
    stats: {
      hp: 85,
      speedMult: 0.72, // ~Mach 0.8
      turnMult: 1.12,
      cannonDamage: 3.2,
      cannonRPM: 2200,
      cannonSpread: 0.014,
      missiles: 4,
      lockRange: 1800,
      lockTime: 1.5,
      lockAngleDeg: 20,
      flareCount: 0,
    },
    special: {
      id: 'trainer',
      label: 'Light Frame',
      detail: 'Sehr wendig, niedrige Stall-Geschwindigkeit',
    },
    fx: singleNozzle(-0.32, 7.70, 0.78, 5.4, [
      [-2.5, -0.35, -1.2], [2.5, -0.35, -1.2],
      [-1.7, -0.4, -0.9], [1.7, -0.4, -0.9],
    ]),
  },
  {
    id: 'elite',
    faction: 'nato',
    name: 'Elite-Jäger',
    callsign: 'RAZOR 9',
    role: 'Interceptor · Experimental',
    description:
      'Experimenteller High-Speed-Interceptor. Extrem schnell, Rail-Burst-Kanone, schwere IR-Raketen und starke Flare-Gegenmaßnahmen.',
    modelUrl: './models/elite-jaeger.glb',
    price: 3200,
    traits: ['Top-Speed', 'Rail-Burst', 'Flares'],
    era: 'modern',
    engineType: 'jet',
    physics: { ...MODERN_JET_PHYSICS, windSusceptibility: 0.18 },
    stats: {
      hp: 90,
      speedMult: 1.2,
      turnMult: 1.0,
      cannonDamage: 7.5,
      cannonRPM: 1800,
      cannonSpread: 0.006,
      missiles: 3,
      lockRange: 2200,
      lockTime: 1.1,
      lockAngleDeg: 14,
      // Bestes NATO-Jet: volle Flare-Last (WT-Gegenmaßnahmen)
      flareCount: 24,
    },
    special: {
      id: 'railburst',
      label: 'Rail-Burst + Flares',
      detail: 'Wuchtige Schüsse, enge Streuung · X = Flares gegen SAMs',
    },
    fx: twinNozzle(0.72, -0.5, 7.35, 0.78, 6.2, [
      [-2.9, -0.4, -1.5], [2.9, -0.4, -1.5],
      [-2.1, -0.45, -1.2], [2.1, -0.45, -1.2],
      [-1.3, -0.5, -0.8], [1.3, -0.5, -0.8],
    ]),
  },

  // ─── RUSSLAND / SOWJET ──────────────────────────────────────────────────
  {
    id: 'su25',
    faction: 'russia',
    name: 'Su-25 Grach',
    callsign: 'FROG 11',
    role: 'CAS · Panzerjäger',
    description:
      'Gepanzerter Erdkampfflugzeug. Langsam, aber extrem robust — ideal gegen SAM und Bodenziele, im Dogfight im Nachteil.',
    modelUrl: './models/su25.glb',
    price: 0,
    traits: ['Panzerung', 'CAS', '30mm GSh'],
    era: 'modern',
    engineType: 'jet',
    physics: {
      ...MODERN_JET_PHYSICS,
      hasAfterburner: false,
      thrustMult: 0.75,
      dragMult: 1.2,
      windSusceptibility: 0.4,
      modelLengthM: 15.5,
    },
    stats: {
      hp: 160,
      speedMult: 0.68, // ~Mach 0.8, langsam
      turnMult: 0.8,
      cannonDamage: 6.5,
      cannonRPM: 2000,
      cannonSpread: 0.015,
      missiles: 4,
      lockRange: 2000,
      lockTime: 1.6,
      lockAngleDeg: 20,
      flareCount: 0,
    },
    special: {
      id: 'armor',
      label: 'Titanwanne',
      detail: 'Sehr hohe Struktur-HP, stark gegen Bodenfeuer',
    },
    fx: twinNozzle(0.65, -0.62, 6.38, 0.78, 6.8, [
      [-3.1, -0.5, -1.5], [3.1, -0.5, -1.5],
      [-2.3, -0.55, -1.2], [2.3, -0.55, -1.2],
    ]),
  },
  {
    id: 'su34',
    faction: 'russia',
    name: 'Su-34 Fullback',
    callsign: 'PLATYPUS',
    role: 'Strike · Fighter-Bomber',
    description:
      'Schwerer Jagdbomber mit starker Bewaffnung. Solide Geschwindigkeit, mittlere Wendigkeit, viele Raketen.',
    modelUrl: './models/su34.glb',
    price: 2200,
    traits: ['Strike', 'Twin AL-31', '8× R-77'],
    era: 'modern',
    engineType: 'jet',
    physics: { ...MODERN_JET_PHYSICS, modelLengthM: 23 },
    stats: {
      hp: 140,
      speedMult: 0.98, // ~Mach 1.8
      turnMult: 0.86,
      cannonDamage: 4.5,
      cannonRPM: 2600,
      cannonSpread: 0.011,
      missiles: 8,
      lockRange: 3200,
      lockTime: 1.1,
      lockAngleDeg: 18,
      flareCount: 0,
    },
    special: {
      id: 'strike',
      label: 'Strike Loadout',
      detail: 'Viele Raketen, robuste Zelle',
    },
    fx: twinNozzle(1.0, -0.38, 4.78, 0.88, 7.8, [
      [-3.6, -0.4, -1.8], [3.6, -0.4, -1.8],
      [-2.7, -0.45, -1.5], [2.7, -0.45, -1.5],
      [-1.8, -0.5, -1.2], [1.8, -0.5, -1.2],
      [-0.9, -0.55, -0.6], [0.9, -0.55, -0.6],
    ]),
  },
  {
    id: 'su57',
    faction: 'russia',
    name: 'Su-57 Felon',
    callsign: 'FELON 1',
    role: 'Stealth · Air Superiority',
    description:
      'Russisches 5.-Gen-Jagdflugzeug. Schnell, wendig, starke Elektronik und umfangreiche Flare-Gegenmaßnahmen.',
    modelUrl: './models/su57.glb',
    price: 2800,
    // Auto-Align setzt Nase auf −Z; früherer yawDeg:180 drehte den Felon rückwärts
    traits: ['5th Gen', 'Supermaneuver', 'Flares'],
    era: 'modern',
    engineType: 'jet',
    physics: { ...MODERN_JET_PHYSICS, windSusceptibility: 0.22, modelLengthM: 20 },
    stats: {
      hp: 120,
      speedMult: 1.16, // ~Mach 2+
      turnMult: 1.12,
      cannonDamage: 4.0,
      cannonRPM: 2800,
      cannonSpread: 0.01,
      missiles: 6,
      lockRange: 3600,
      lockTime: 0.9,
      lockAngleDeg: 20,
      // Bestes Russland-Jet: volle Flare-Last (WT-Gegenmaßnahmen)
      flareCount: 24,
    },
    special: {
      id: 'supermaneuver',
      label: 'Supermaneuver + Flares',
      detail: 'Hohe Wendigkeit · X = Flares gegen SAMs (50/50 Spoof)',
    },
    fx: twinNozzle(1.0, -0.3, 6.30, 0.84, 7.2, [
      [-3.3, -0.35, -1.6], [3.3, -0.35, -1.6],
      [-2.5, -0.4, -1.3], [2.5, -0.4, -1.3],
      [-1.6, -0.45, -0.9], [1.6, -0.45, -0.9],
    ]),
  },
];

export const FACTION_LABELS: Record<JetFaction, string> = {
  nato: 'NATO / West',
  russia: 'Russland / Sowjet',
};

export function getJetDef(id: JetId): JetDef {
  return JET_CATALOG.find((j) => j.id === id) ?? JET_CATALOG[0];
}

export function jetsByFaction(faction: JetFaction): JetDef[] {
  return JET_CATALOG.filter((j) => j.faction === faction);
}

/** Alle Jets, sortiert nach Preis (günstigste zuerst) */
export function jetsSortedByPrice(): JetDef[] {
  return [...JET_CATALOG].sort((a, b) => a.price - b.price);
}

/** Legacy / schwächere Maschinen für frühe Wellen */
export function legacyJetIds(): JetId[] {
  return JET_CATALOG.filter((j) => j.era === 'propeller' || j.era === 'early_jet').map((j) => j.id);
}

export function isLegacyAircraft(id: JetId): boolean {
  const d = getJetDef(id);
  return d.era === 'propeller' || d.era === 'early_jet';
}

export function hasGuidedMissiles(def: JetDef): boolean {
  return def.stats.missiles > 0 && def.stats.lockRange > 0;
}

/**
 * FX-Tupel als THREE.Vector3-Arrays (frisch pro Aufruf).
 * Koordinaten werden mit dem Faktor (modelLengthM / 15.5) skaliert,
 * sodass sie zur tatsächlich geladenen Modellgröße passen.
 */
export function jetFxVectors(def: JetDef) {
  const modelLen = def.physics.modelLengthM ?? 15.5;
  const factor = modelLen / 15.5;
  const scale = (v: [number, number, number]) =>
    new THREE.Vector3(v[0] * factor, v[1] * factor, v[2] * factor);

  return {
    nozzles: def.fx.nozzles.map(scale),
    nozzleScale: def.fx.nozzleScale,
    muzzles: def.fx.muzzles.map(scale),
    hardpoints: def.fx.hardpoints.map(scale),
    wingHalfSpan: def.fx.wingHalfSpan * factor,
  };
}
