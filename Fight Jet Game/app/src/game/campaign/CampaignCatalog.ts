import type { MapId } from '../world/MapCatalog';

/** Eine Welle innerhalb eines Kampagnen-Levels */
export interface CampaignWave {
  /** Anzeige-Label (Banner) */
  label: string;
  /** Luftgegner */
  bandits: number;
  /** Geschwindigkeits-Multiplikator der Banditen (0.35–1.4) */
  speedScale: number;
  /** Banditen dürfen Luft-Luft-Raketen führen */
  enemyMissiles: boolean;
  /** AAA / Flak-Fahrzeuge (Bodenkanone, keine Lenkwaffen) */
  aaa: number;
  /** SAM-Stellungen (Boden-Luft-Raketen) */
  sams: number;
  /** Optional: SAM-Feuerrate-Multiplikator (1 = normal, 1.4 = langsamer) */
  samFireSlow?: number;
}

export type MissionType =
  | 'training'
  | 'intercept'
  | 'sead'
  | 'escort'
  | 'strike';

export interface CampaignLevel {
  id: string;
  /** 1–5 */
  index: number;
  name: string;
  codename: string;
  description: string;
  /** Map für dieses Level */
  mapId: MapId;
  /** Sterne 1–5 */
  difficulty: number;
  /** Kurz-Tags für UI */
  tags: string[];
  /** Belohnung in Aero Credits bei Sieg (Erstabschluss) */
  rewardCredits: number;
  /** Missionsart für UI / Debrief */
  missionType: MissionType;
  /** Primäraufgabe (kurz) */
  primaryObjective: string;
  /** Optionaler Bonus-Hinweis */
  bonusObjective?: string;
  /** Briefing-Text vor dem Einsatz */
  briefing: string;
  /** Debrief bei Sieg */
  debriefVictory: string;
  waves: CampaignWave[];
}

/**
 * 5 Kampagnen-Level — je eigene Dramaturgie, nicht nur Zahlen.
 * Belohnungen so skaliert, dass Progression von Startjets → Topjets möglich ist.
 */
export const CAMPAIGN_LEVELS: CampaignLevel[] = [
  {
    id: 'op-first-flight',
    index: 1,
    name: 'First Contact',
    codename: 'OPERATION FIRST FLIGHT',
    description:
      'Trainings-Einsatz über dem Archipel. Langsame Banditen und leichte Flak — keine feindlichen Raketen. Ideal zum Einfliegen.',
    mapId: 'islands',
    difficulty: 1,
    tags: ['Training', 'Keine Raketen', 'AAA'],
    rewardCredits: 900,
    missionType: 'training',
    primaryObjective: 'Eliminiere alle feindlichen Aufklärer und Flak-Stellungen.',
    bonusObjective: 'Keine eigenen Schäden unter 50 % Airframe.',
    briefing:
      'Willkommen bei Steel Ops. Heute trainierst du Mouse-Aim, Kanone und Situationsbewusstsein. Keine feindlichen Lenkwaffen — nutze die Zeit, um den Jet und das HUD kennenzulernen.',
    debriefVictory:
      'Gute Arbeit, Pilot. Basisausbildung bestanden. Credits freigegeben — nächster Schritt: Glacier-Patrouille.',
    waves: [
      {
        label: 'WELLE 1 · AUFKLÄRER',
        bandits: 2,
        speedScale: 0.38,
        enemyMissiles: false,
        aaa: 0,
        sams: 0,
      },
      {
        label: 'WELLE 2 · FLAK-GÜRTEL',
        bandits: 3,
        speedScale: 0.42,
        enemyMissiles: false,
        aaa: 2,
        sams: 0,
      },
      {
        label: 'WELLE 3 · BODEN + LUFT',
        bandits: 3,
        speedScale: 0.48,
        enemyMissiles: false,
        aaa: 3,
        sams: 0,
      },
    ],
  },
  {
    id: 'op-frost-line',
    index: 2,
    name: 'Frost Line',
    codename: 'OPERATION FROST LINE',
    description:
      'Abfang-Patrouille über dem Glacier. Mehr Banditen, dichtere AAA. Noch keine SAMs — aber die Flak sitzt dich härter.',
    mapId: 'glacier',
    difficulty: 2,
    tags: ['Glacier', 'Abfangen', 'AAA'],
    rewardCredits: 1400,
    missionType: 'intercept',
    primaryObjective: 'Fange die Banditen-Schwärme ab, bevor sie den Korridor freidrücken.',
    bonusObjective: 'Zerstöre alle AAA-Nester.',
    briefing:
      'Feindliche Jäger drängen über den Glacier-Korridor. Keine SAMs, aber dichte Flak. Halte Energie, nutze Terrain und beende die Wellen schnell.',
    debriefVictory:
      'Korridor gesichert. Glacier bleibt unter Kontrolle. Nächste Stufe: SEAD gegen die ersten Radar-Stellungen.',
    waves: [
      {
        label: 'WELLE 1 · KALTSTART',
        bandits: 3,
        speedScale: 0.55,
        enemyMissiles: false,
        aaa: 2,
        sams: 0,
      },
      {
        label: 'WELLE 2 · FLAK-NEST',
        bandits: 4,
        speedScale: 0.7,
        enemyMissiles: false,
        aaa: 4,
        sams: 0,
      },
      {
        label: 'WELLE 3 · TAL-ÜBERFLUG',
        bandits: 4,
        speedScale: 0.85,
        enemyMissiles: false,
        aaa: 5,
        sams: 0,
      },
    ],
  },
  {
    id: 'op-iron-curtain',
    index: 3,
    name: 'Iron Curtain',
    codename: 'OPERATION IRON CURTAIN',
    description:
      'Erster SEAD-Einsatz. SAMs kommen online, Banditen führen erste Luft-Luft-Raketen. Zerstöre die Stellungen.',
    mapId: 'islands',
    difficulty: 3,
    tags: ['SEAD', 'SAM', 'Raketen'],
    rewardCredits: 2000,
    missionType: 'sead',
    primaryObjective: 'Neutralisiere alle SAM-Stellungen und sichere den Luftraum.',
    bonusObjective: 'Überlebe mit mindestens einer Flare-Salve in Reserve.',
    briefing:
      'Radar-Netz online. SAM-Batterien und erste feindliche A/A-Raketen. Flares (X/Z) sind jetzt überlebenswichtig. Priorisiere SAMs, wenn die RWR schreit.',
    debriefVictory:
      'SAM-Netz niedergekämpft. SEAD-Phase bestanden — du bist bereit für schwere Bergverteidigung.',
    waves: [
      {
        label: 'WELLE 1 · RADAR-KONTAKT',
        bandits: 3,
        speedScale: 0.75,
        enemyMissiles: false,
        aaa: 2,
        sams: 1,
        samFireSlow: 1.35,
      },
      {
        label: 'WELLE 2 · MISSILE ALERT',
        bandits: 4,
        speedScale: 0.9,
        enemyMissiles: true,
        aaa: 3,
        sams: 2,
        samFireSlow: 1.15,
      },
      {
        label: 'WELLE 3 · SAM-NETZ',
        bandits: 5,
        speedScale: 1.0,
        enemyMissiles: true,
        aaa: 3,
        sams: 3,
      },
    ],
  },
  {
    id: 'op-whiteout',
    index: 4,
    name: 'Whiteout',
    codename: 'OPERATION WHITEOUT',
    description:
      'Konvoi-Eskorte über den Bergen. Viele Banditen, aggressive SAMs und AAA. Energy-Management zählt.',
    mapId: 'glacier',
    difficulty: 4,
    tags: ['Hard', 'Eskorte', 'Berge'],
    rewardCredits: 2800,
    missionType: 'escort',
    primaryObjective: 'Halte den Bergkorridor freiräumig: alle Wellen und Bodenziele zerstören.',
    bonusObjective: 'Kein Absturz trotz SAM-Druck.',
    briefing:
      'Ein logistischer Konvoi nutzt den Glacier-Pass. Deine Aufgabe: Luftdeckung und SEAD gleichzeitig. Nutze Täler als Deckung, spare Flares für echte Bedrohungen.',
    debriefVictory:
      'Korridor gehalten. Der Konvoi kommt durch. Finale Schlacht wartet auf dem Archipel.',
    waves: [
      {
        label: 'WELLE 1 · BERG-PATROUILLE',
        bandits: 4,
        speedScale: 1.0,
        enemyMissiles: true,
        aaa: 3,
        sams: 2,
      },
      {
        label: 'WELLE 2 · DOPPEL-GÜRTEL',
        bandits: 5,
        speedScale: 1.05,
        enemyMissiles: true,
        aaa: 4,
        sams: 3,
      },
      {
        label: 'WELLE 3 · STURMFRONT',
        bandits: 6,
        speedScale: 1.1,
        enemyMissiles: true,
        aaa: 4,
        sams: 4,
      },
    ],
  },
  {
    id: 'op-final-storm',
    index: 5,
    name: 'Final Storm',
    codename: 'OPERATION FINAL STORM',
    description:
      'Finale Schlacht. Massive Luftflotte, dichter SAM-Ring und Flak. Nur für erfahrene Piloten.',
    mapId: 'islands',
    difficulty: 5,
    tags: ['Boss', 'Maximum', 'Strike'],
    rewardCredits: 4200,
    missionType: 'strike',
    primaryObjective: 'Breche die feindliche Hauptverteidigung und beende alle drei Wellen.',
    bonusObjective: 'Sieg mit einem Top-Tier-Jet freischalten.',
    briefing:
      'Gesamte feindliche Luft- und Bodenverteidigung. Dies ist der Härtetest: Energy fight, Flares, SEAD und Dogfight in einem. Kein Raum für Fehler.',
    debriefVictory:
      'Final Storm beendet. Steel Ops ist stolz — Kampagne abgeschlossen. Wiederhole Missionen für Farming-Credits (25 % Wiederholungsbonus).',
    waves: [
      {
        label: 'WELLE 1 · ERSTE WELLE',
        bandits: 5,
        speedScale: 1.05,
        enemyMissiles: true,
        aaa: 4,
        sams: 3,
      },
      {
        label: 'WELLE 2 · VOLLER DRUCK',
        bandits: 6,
        speedScale: 1.15,
        enemyMissiles: true,
        aaa: 5,
        sams: 4,
      },
      {
        label: 'WELLE 3 · LETZTER ANGRIFF',
        bandits: 7,
        speedScale: 1.2,
        enemyMissiles: true,
        aaa: 5,
        sams: 5,
      },
    ],
  },
];

export function getCampaignLevel(id: string): CampaignLevel {
  return CAMPAIGN_LEVELS.find((l) => l.id === id) ?? CAMPAIGN_LEVELS[0];
}

export function getCampaignLevelByIndex(index: number): CampaignLevel {
  return CAMPAIGN_LEVELS.find((l) => l.index === index) ?? CAMPAIGN_LEVELS[0];
}
