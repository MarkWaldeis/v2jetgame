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
  /** Maschinenlesbares Bonusziel (Debrief-Auswertung) */
  bonusId?: 'hull50' | 'clearAllAaa' | 'flaresLeft' | 'survived' | 'topTier';
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
      'Training sortie over the archipelago. Slow bandits and light AAA — no enemy missiles. Best place to learn the jet.',
    mapId: 'islands',
    difficulty: 1,
    tags: ['Training', 'No missiles', 'AAA'],
    rewardCredits: 900,
    missionType: 'training',
    primaryObjective: 'Destroy all enemy scouts and AAA sites.',
    bonusObjective: 'Keep airframe damage under 50%.',
    bonusId: 'hull50',
    briefing:
      'Welcome to Steel Ops. Today you practice mouse-aim, the cannon, and situational awareness. No enemy missiles — use the time to learn the jet and the HUD.',
    debriefVictory:
      'Good work, pilot. Basic training complete. Credits released — next up is a glacier patrol.',
    waves: [
      {
        label: 'WAVE 1 · SCOUTS',
        bandits: 2,
        speedScale: 0.38,
        enemyMissiles: false,
        aaa: 0,
        sams: 0,
      },
      {
        label: 'WAVE 2 · AAA BELT',
        bandits: 3,
        speedScale: 0.42,
        enemyMissiles: false,
        aaa: 2,
        sams: 0,
      },
      {
        label: 'WAVE 3 · AIR AND GROUND',
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
      'Intercept patrol over the glacier. More bandits, denser AAA. Still no SAMs — but the flak hits harder.',
    mapId: 'glacier',
    difficulty: 2,
    tags: ['Glacier', 'Intercept', 'AAA'],
    rewardCredits: 1400,
    missionType: 'intercept',
    primaryObjective: 'Intercept the bandit swarms before they push the corridor.',
    bonusObjective: 'Destroy every AAA nest.',
    bonusId: 'clearAllAaa',
    briefing:
      'Hostile fighters are pushing the glacier corridor. No SAMs, but the flak is thick. Hold energy, use terrain, and finish the waves quickly.',
    debriefVictory:
      'Corridor secured. The glacier stays under control. Next: SEAD against the first radar sites.',
    waves: [
      {
        label: 'WAVE 1 · COLD START',
        bandits: 3,
        speedScale: 0.55,
        enemyMissiles: false,
        aaa: 2,
        sams: 0,
      },
      {
        label: 'WAVE 2 · FLAK NEST',
        bandits: 4,
        speedScale: 0.7,
        enemyMissiles: false,
        aaa: 4,
        sams: 0,
      },
      {
        label: 'WAVE 3 · VALLEY RUN',
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
      'First SEAD sortie. SAMs come online, and bandits start carrying air-to-air missiles. Kill the sites.',
    mapId: 'islands',
    difficulty: 3,
    tags: ['SEAD', 'SAM', 'Missiles'],
    rewardCredits: 2000,
    missionType: 'sead',
    primaryObjective: 'Neutralize every SAM site and hold the airspace.',
    bonusObjective: 'Survive with at least one flare burst left.',
    bonusId: 'flaresLeft',
    briefing:
      'Radar net is live. SAM batteries and the first enemy A/A missiles. Flares (X/Z) keep you alive now. Prioritize SAMs when the RWR screams.',
    debriefVictory:
      'SAM net is down. SEAD phase complete — you are ready for the mountain defenses.',
    waves: [
      {
        label: 'WAVE 1 · RADAR CONTACT',
        bandits: 3,
        speedScale: 0.75,
        enemyMissiles: false,
        aaa: 2,
        sams: 1,
        samFireSlow: 1.35,
      },
      {
        label: 'WAVE 2 · MISSILE ALERT',
        bandits: 4,
        speedScale: 0.9,
        enemyMissiles: true,
        aaa: 3,
        sams: 2,
        samFireSlow: 1.15,
      },
      {
        label: 'WAVE 3 · SAM NET',
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
      'Convoy escort over the mountains. Many bandits, aggressive SAMs and AAA. Energy management matters.',
    mapId: 'glacier',
    difficulty: 4,
    tags: ['Hard', 'Escort', 'Mountains'],
    rewardCredits: 2800,
    missionType: 'escort',
    primaryObjective: 'Keep the mountain corridor clear: finish every wave and ground target.',
    bonusObjective: 'Do not get shot down under SAM pressure.',
    bonusId: 'survived',
    briefing:
      'A logistics convoy is using the glacier pass. You fly cover and SEAD at the same time. Use valleys for cover, save flares for real threats.',
    debriefVictory:
      'Corridor held. The convoy gets through. The final battle waits on the archipelago.',
    waves: [
      {
        label: 'WAVE 1 · MOUNTAIN PATROL',
        bandits: 4,
        speedScale: 1.0,
        enemyMissiles: true,
        aaa: 3,
        sams: 2,
      },
      {
        label: 'WAVE 2 · DOUBLE BELT',
        bandits: 5,
        speedScale: 1.05,
        enemyMissiles: true,
        aaa: 4,
        sams: 3,
      },
      {
        label: 'WAVE 3 · STORM FRONT',
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
      'Final battle. A large air force, a dense SAM ring, and heavy flak. For experienced pilots only.',
    mapId: 'islands',
    difficulty: 5,
    tags: ['Boss', 'Maximum', 'Strike'],
    rewardCredits: 4200,
    missionType: 'strike',
    primaryObjective: 'Break the main defense and finish all three waves.',
    bonusObjective: 'Win in a top-tier jet.',
    bonusId: 'topTier',
    briefing:
      'The full enemy air and ground defense. This is the test: energy fighting, flares, SEAD, and a dogfight in one. No room for mistakes.',
    debriefVictory:
      'Final Storm is over. Steel Ops is proud — campaign complete. Replay missions for farming credits (25% repeat bonus).',
    waves: [
      {
        label: 'WAVE 1 · FIRST PUSH',
        bandits: 5,
        speedScale: 1.05,
        enemyMissiles: true,
        aaa: 4,
        sams: 3,
      },
      {
        label: 'WAVE 2 · FULL PRESSURE',
        bandits: 6,
        speedScale: 1.15,
        enemyMissiles: true,
        aaa: 5,
        sams: 4,
      },
      {
        label: 'WAVE 3 · LAST ATTACK',
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
