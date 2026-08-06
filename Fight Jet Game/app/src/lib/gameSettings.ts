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
}

const KEY = 'fightjet3d.settings.v1';

const INITIAL_OWNED = ['f16', 'su25'];

/**
 * TEMP / DEV: Sehr hohe Credits zum Testen aller Jets.
 * Später wieder auf einen normalen Startwert (z.B. 500–2000) setzen.
 */
export const DEV_TEST_CREDITS = 9_999_999;

export const DEFAULT_SETTINGS: GameSettings = {
  graphicsQuality: 'high',
  showHud: true,
  masterVolume: 0.85,
  muted: false,
  aeroCredits: DEV_TEST_CREDITS,
  ownedJets: [...INITIAL_OWNED],
};

export function loadSettings(): GameSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS, ownedJets: [...INITIAL_OWNED] };
    const parsed = JSON.parse(raw) as Partial<GameSettings>;
    // Migration: ensure initial owned jets
    if (!parsed.ownedJets || parsed.ownedJets.length === 0) {
      parsed.ownedJets = [...INITIAL_OWNED];
    }
    const result: GameSettings = {
      ...DEFAULT_SETTINGS,
      ...parsed,
      masterVolume: Math.max(0, Math.min(1, parsed.masterVolume ?? DEFAULT_SETTINGS.masterVolume)),
      ownedJets: [...(parsed.ownedJets ?? INITIAL_OWNED)],
      // TEMP: immer genug Credits für den gesamten Jet-Katalog
      aeroCredits: Math.max(
        DEV_TEST_CREDITS,
        Math.max(0, parsed.aeroCredits ?? DEFAULT_SETTINGS.aeroCredits)
      ),
    };
    // Persistiere den Dev-Credit-Boost, damit UI + Kauf sofort greifen
    if ((parsed.aeroCredits ?? 0) < DEV_TEST_CREDITS) {
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
  const s = loadSettings();
  if (s.ownedJets.includes(jetId)) return true; // already owned
  if (s.aeroCredits < price) return false;
  s.aeroCredits -= price;
  s.ownedJets.push(jetId);
  saveSettings(s);
  return true;
}

/** Stats 0–100 für Glass-Progress-Balken aus Jet-Def (inkl. WWII-Props ~0.45) */
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
