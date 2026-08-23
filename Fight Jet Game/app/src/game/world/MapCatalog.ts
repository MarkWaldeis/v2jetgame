// Katalog fliegbarer Karten: prozedural + große GLB-Maps.
export type MapId = 'islands' | 'glacier';

export type MapKind = 'procedural' | 'glb';

/** Feste, befestigte Landebahn auf einer Karte (Welt-Rechteck). */
export interface RunwayDef {
  centerX: number;
  centerZ: number;
  /** Ausrichtung der Landebahn-Längsachse in Grad (0 = entlang Welt-Z). */
  headingDeg: number;
  /** Länge entlang der Landebahn-Achse (m). */
  length: number;
  /** Breite quer zur Landebahn-Achse (m). */
  width: number;
  label: string;
}

export interface MapDef {
  id: MapId;
  name: string;
  subtitle: string;
  description: string;
  kind: MapKind;
  /** GLB unter public/ */
  modelUrl?: string;
  /**
   * Ziel-Spannweite der längsten horizontalen Achse (m) nach Skalierung.
   * Maps müssen groß sein — unter ~8 km werden sie verworfen.
   */
  targetSpanM: number;
  /** Spielbare Weltgröße (m Kante) */
  worldSizeM: number;
  /** Y-Skalierung (1 = native; City oft 1 bei XZ-Stretch) */
  heightScale: number;
  /** true = XZ-Stretch, Y separat (Städte) */
  nonUniformScale: boolean;
  /** Meer anzeigen */
  showSea: boolean;
  fogFar: number;
  /** Spawn-Höhe über Terrain (m) */
  spawnClearance: number;
  /**
   * Höhenquelle:
   * - raycast: Raster per Raycast (Terrain-Meshes)
   * - ground-plane: flacher Boden (dichte Städte — Arcade-tauglich, schnell)
   */
  heightMode?: 'raycast' | 'ground-plane';
  tags: string[];
  /** Vorhandene befestigte Landebahn (macht Landen dort deutlich leichter). */
  runway?: RunwayDef;
}

/** Mindest-Längste-Achse des Roh-Assets (m), sonst unbrauchbar */
export const MIN_MAP_SPAN_M = 4000;

export const MAP_CATALOG: MapDef[] = [
  {
    id: 'islands',
    name: 'Stormbreak Archipelago',
    subtitle: 'Volcanic islands · naval air station',
    description:
      'A 42 × 42 km Pacific theater: volcanic caldera, fjord canyons, a live ocean, villages, and a naval air station.',
    kind: 'procedural',
    targetSpanM: 42000,
    worldSizeM: 42000,
    heightScale: 1,
    nonUniformScale: false,
    showSea: true,
    fogFar: 34000,
    spawnClearance: 950,
    tags: ['New', '42 km', 'Ocean', 'Airbase'],
    // Naval Air Station Kestrel: befestigte Piste bei (0, 3200), siehe StormbreakTerrain.buildAirbase().
    // Deckt die sichtbare Betonplatte + Asphaltbahn aus StormbreakTerrain.buildAirbase() ab.
    runway: {
      centerX: 0,
      centerZ: 3200,
      headingDeg: 0,
      length: 2820,
      width: 200,
      label: 'Naval Air Station Kestrel',
    },
  },
  {
    id: 'glacier',
    name: 'Glacier National Park',
    subtitle: 'Montana · Terrain',
    description:
      'A vast mountain range from a 3D terrain mesh. After scale it is about 28 km across — open valleys and peaks.',
    kind: 'glb',
    modelUrl: './maps/glacier.glb',
    // Roh ~167 km → auf ~28 km bringen (noch groß, Mesh bleibt sichtbar)
    targetSpanM: 28000,
    worldSizeM: 30000,
    heightScale: 1,
    nonUniformScale: false,
    showSea: false,
    fogFar: 22000,
    spawnClearance: 600,
    heightMode: 'raycast',
    tags: ['Large', 'Mountains', 'Terrain'],
  },
];

export function getMapDef(id: MapId): MapDef {
  return MAP_CATALOG.find((m) => m.id === id) ?? MAP_CATALOG[0];
}

/** Prüft, ob eine Welt-Position innerhalb des Landebahn-Rechtecks liegt. */
export function isOnRunway(runway: RunwayDef, x: number, z: number): boolean {
  const dx = x - runway.centerX;
  const dz = z - runway.centerZ;
  const rad = (-runway.headingDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const localX = dx * cos - dz * sin;
  const localZ = dx * sin + dz * cos;
  return Math.abs(localX) <= runway.width / 2 && Math.abs(localZ) <= runway.length / 2;
}
