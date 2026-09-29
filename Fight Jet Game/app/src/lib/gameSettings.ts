/** Persistente Spiel-Einstellungen (Liquid Glass Settings Modal) */

export type GraphicsQuality = 'low' | 'medium' | 'high';

export interface GameSettings {
  graphicsQuality: GraphicsQuality;
  showHud: boolean;
  masterVolume: number; // 0..1
  muted: boolean;
  /** Aero Credits Währung */
  aeroCredits: number;
  /** Freigeschaltete Jet-IDs (initial nur f16 + su25) */
  ownedJets: string[];
  /** Abgeschlossene Kampagnen-Level-IDs */
  completedCampaignLevels: string[];
  /** Höchstes freigeschaltetes Level-Index (1–5) */
  campaignUnlockedMax: number;
  /** Bester Score je Kampagnen-Level (id → Punkte) */
  bestScorePerLevel: Record<string, number>;
  /** Bester Gesamtscore einer Sortie */
  bestScore: number;
  /** Gesamt-Zähler für den Service Record */
  totalSorties: number;
  totalAirKills: number;
  totalGroundKills: number;
  totalVictories: number;
  /**
   * Einmalige Migration: Dev-Credits (9_999_999) erkannt und zurückgesetzt.
   * Verhindert wiederholte Resets.
   */
  economyMigratedV2?: boolean;
}

const KEY = 'fightjet3d.settings.v1';

const INITIAL_OWNED = ['f16', 'su25'];

/** Normaler Startwert für die Veröffentlichung */
export const START_CREDITS = 1200;

/** Schwelle, ab der gespeicherte Credits als alter Dev-Boost gelten */
const DEV_CREDIT_THRESHOLD = 1_000_000;

/** Wiederholungsbonus: Anteil der vollen Belohnung bei erneutem Level-Abschluss */
export const REPEAT_REWARD_RATIO = 0.25;

/**
 * Dev-Credits nur im lokalen Vite-Dev-Server:
 * - `?devCredits=1` in der URL, oder
 * - localStorage-Flag `fightjet3d.devCredits=1`
 * Im Produktions-Build (itch.io / GitHub Pages) immer aus.
 */
function isDevCreditBoostEnabled(): boolean {
  if (!import.meta.env.DEV) return false;
  try {
    if (typeof window !== 'undefined') {
      const q = new URLSearchParams(window.location.search);
      if (q.get('devCredits') === '1' || q.get('devCredits') === 'true') return true;
      if (localStorage.getItem('fightjet3d.devCredits') === '1') return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

export const DEFAULT_SETTINGS: GameSettings = {
  graphicsQuality: 'high',
  showHud: true,
  masterVolume: 0.85,
  muted: false,
  aeroCredits: START_CREDITS,
  ownedJets: [...INITIAL_OWNED],
  completedCampaignLevels: [],
  campaignUnlockedMax: 1,
  bestScorePerLevel: {},
  bestScore: 0,
  totalSorties: 0,
  totalAirKills: 0,
  totalGroundKills: 0,
  totalVictories: 0,
  economyMigratedV2: true,
};

export function loadSettings(): GameSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS, ownedJets: [...INITIAL_OWNED] };
    const parsedUnknown: unknown = JSON.parse(raw);
    if (!parsedUnknown || typeof parsedUnknown !== 'object' || Array.isArray(parsedUnknown)) {
      return { ...DEFAULT_SETTINGS, ownedJets: [...INITIAL_OWNED] };
    }
    const parsed = parsedUnknown as Partial<GameSettings>;
    // Migration: ensure initial owned jets
    if (!parsed.ownedJets || parsed.ownedJets.length === 0) {
      parsed.ownedJets = [...INITIAL_OWNED];
    }

    let credits = Math.max(0, parsed.aeroCredits ?? START_CREDITS);
    let economyMigratedV2 = parsed.economyMigratedV2 === true;

    // Alter Dev-Boost (9_999_999): einmalig auf Startcredits zurücksetzen, Besitz behalten
    if (!economyMigratedV2 && credits >= DEV_CREDIT_THRESHOLD) {
      credits = START_CREDITS;
      economyMigratedV2 = true;
    } else if (!economyMigratedV2) {
      economyMigratedV2 = true;
    }

    // Optionaler lokaler Debug-Boost (nie Default im Produkt)
    if (isDevCreditBoostEnabled()) {
      credits = Math.max(credits, 9_999_999);
    }

    const result: GameSettings = {
      ...DEFAULT_SETTINGS,
      ...parsed,
      masterVolume: Math.max(0, Math.min(1, parsed.masterVolume ?? DEFAULT_SETTINGS.masterVolume)),
      ownedJets: [...(parsed.ownedJets ?? INITIAL_OWNED)],
      completedCampaignLevels: [...(parsed.completedCampaignLevels ?? [])],
      bestScorePerLevel:
        parsed.bestScorePerLevel && typeof parsed.bestScorePerLevel === 'object'
          ? { ...parsed.bestScorePerLevel }
          : {},
      bestScore: Math.max(0, parsed.bestScore ?? 0),
      totalSorties: Math.max(0, parsed.totalSorties ?? 0),
      totalAirKills: Math.max(0, parsed.totalAirKills ?? 0),
      totalGroundKills: Math.max(0, parsed.totalGroundKills ?? 0),
      totalVictories: Math.max(0, parsed.totalVictories ?? 0),
      campaignUnlockedMax: Math.max(
        1,
        Math.min(5, parsed.campaignUnlockedMax ?? 1)
      ),
      aeroCredits: credits,
      economyMigratedV2,
    };

    // Persistierte Migration, damit der Reset nicht bei jedem Laden greift
    if (parsed.economyMigratedV2 !== true || (parsed.aeroCredits ?? 0) >= DEV_CREDIT_THRESHOLD) {
      try {
        localStorage.setItem(KEY, JSON.stringify(result));
      } catch {
        /* ignore */
      }
    }
    return result;
  } catch {
    return { ...DEFAULT_SETTINGS, ownedJets: [...INITIAL_OWNED] };
  }
}

export function saveSettings(s: GameSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

/** Prüft, ob ein Jet freigeschaltet ist */
export function isJetOwned(jetId: string): boolean {
  const s = loadSettings();
  return s.ownedJets.includes(jetId);
}

/** Schaltet einen Jet frei und zieht Credits ab */
export function purchaseJet(jetId: string, price: number): boolean {
  const id = jetId.trim();
  if (!id) return false;
  const cost = Number.isFinite(price) ? Math.max(0, Math.floor(price)) : 0;
  const s = loadSettings();
  if (s.ownedJets.includes(id)) return true; // already owned
  if (s.aeroCredits < cost) return false;
  s.aeroCredits -= cost;
  s.ownedJets.push(id);
  saveSettings(s);
  return true;
}

/**
 * Schaltet alle Katalog-Jets frei (Debug / Komfort).
 * @returns Liste der freigeschalteten IDs
 */
export function unlockAllJets(allJetIds: string[]): string[] {
  const s = loadSettings();
  const set = new Set([...s.ownedJets, ...allJetIds]);
  s.ownedJets = [...set];
  saveSettings(s);
  return s.ownedJets;
}

export function isCampaignLevelUnlocked(levelIndex: number): boolean {
  const s = loadSettings();
  return levelIndex <= s.campaignUnlockedMax;
}

export function isCampaignLevelCompleted(levelId: string): boolean {
  return loadSettings().completedCampaignLevels.includes(levelId);
}

/**
 * Markiert Level als geschafft, schaltet nächstes frei, Credits gutschreiben.
 * Erstabschluss = volle Belohnung; Wiederholung = REPEAT_REWARD_RATIO.
 * @returns neue Credit-Summe
 */
export function completeCampaignLevel(levelId: string, levelIndex: number, reward: number): number {
  const s = loadSettings();
  const firstClear = !s.completedCampaignLevels.includes(levelId);
  if (firstClear) {
    s.completedCampaignLevels.push(levelId);
  }
  s.campaignUnlockedMax = Math.max(s.campaignUnlockedMax, Math.min(5, levelIndex + 1));
  const granted = firstClear ? reward : Math.round(reward * REPEAT_REWARD_RATIO);
  s.aeroCredits += granted;
  saveSettings(s);
  return s.aeroCredits;
}

/** Bester Score eines Levels (0 = nie geschafft/gespielt) */
export function getBestScore(levelId: string): number {
  return loadSettings().bestScorePerLevel[levelId] ?? 0;
}

export interface SortieResult {
  levelId: string | null;
  score: number;
  airKills: number;
  groundKills: number;
  victory: boolean;
}

/**
 * Sortie-Auswertung: Gesamtzähler + Bestmarken nach jeder Mission.
 * @returns aktualisiertes Settings-Objekt
 */
export function recordSortie(r: SortieResult): GameSettings {
  const s = loadSettings();
  s.totalSorties += 1;
  s.totalAirKills += Math.max(0, r.airKills);
  s.totalGroundKills += Math.max(0, r.groundKills);
  if (r.victory) s.totalVictories += 1;
  s.bestScore = Math.max(s.bestScore, Math.max(0, r.score));
  if (r.levelId) {
    const prev = s.bestScorePerLevel[r.levelId] ?? 0;
    if (r.score > prev) s.bestScorePerLevel[r.levelId] = r.score;
  }
  saveSettings(s);
  return s;
}
export function jetStatBars(stats: {
  speedMult: number;
  turnMult: number;
  hp: number;
  missiles: number;
  cannonDamage: number;
  lockRange: number;
}) {
  return {
    speed: Math.round(
      Math.max(0, Math.min(100, ((stats.speedMult - 0.4) / 0.9) * 100))
    ),
    maneuver: Math.round(
      Math.max(0, Math.min(100, ((stats.turnMult - 0.55) / 0.7) * 100))
    ),
    armor: Math.round(Math.max(0, Math.min(100, (stats.hp / 160) * 100))),
    weapons: Math.round(
      Math.max(
        0,
        Math.min(
          100,
          (stats.missiles / 8) * 35 +
            (stats.cannonDamage / 8) * 35 +
            (stats.lockRange / 4200) * 30
        )
      )
    ),
  };
}
