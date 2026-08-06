// Katalog fliegbarer Karten: prozedural + große GLB-Maps.
export type MapId = 'islands' | 'glacier';

export type MapKind = 'procedural' | 'glb';

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
}

/** Mindest-Längste-Achse des Roh-Assets (m), sonst unbrauchbar */
export const MIN_MAP_SPAN_M = 4000;

export const MAP_CATALOG: MapDef[] = [
  {
    id: 'islands',
    name: 'Stormbreak Archipelago',
    subtitle: 'Vulkaninseln · Naval Air Station',
    description:
      '42 × 42 km Pazifik-Welt mit Vulkan-Caldera, Fjord-Canyons, dynamischem Ozean, Dörfern und Marineflugplatz.',
    kind: 'procedural',
    targetSpanM: 42000,
    worldSizeM: 42000,
    heightScale: 1,
    nonUniformScale: false,
    showSea: true,
    fogFar: 34000,
    spawnClearance: 950,
    tags: ['Neu', '42 km', 'Ozean', 'Militärbasis'],
  },
  {
    id: 'glacier',
    name: 'Glacier National Park',
    subtitle: 'Montana · Terrain',
    description:
      'Riesige Berglandschaft aus echtem 3D-Terrain. Nach Skalierung ~28 km Kante — weite Täler und Gipfel.',
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
    tags: ['Groß', 'Berge', 'Terrain'],
  },
];

export function getMapDef(id: MapId): MapDef {
  return MAP_CATALOG.find((m) => m.id === id) ?? MAP_CATALOG[0];
}
