/**
 * Datengetriebene Raketenprofile (Arcade, keine realen Militärdaten).
 * IR = eng, flare-empfindlich · ARH = BVR, robuster · SAM = Bodenbedrohung
 */
import type { MissileVisualId } from './MissileVisuals';

export type SeekerType = 'ir' | 'arh' | 'sam';

export type MissileDefId =
  | 'aim9'
  | 'aim120'
  | 'aim54'
  | 'r77'
  | 'r73'
  | 'enemy_ir'
  | 'sam_std';

export interface MissileDef {
  id: MissileDefId;
  /** Anzeige im HUD / Loadout */
  label: string;
  seekerType: SeekerType;
  visualId: MissileVisualId;
  /** Flugwerte (m/s, s, rad/s) */
  speed: number;
  life: number;
  turnRate: number;
  damage: number;
  proximityRadius: number;
  lockLoseAngleDeg: number;
  boostTime: number;
  leadGain: number;
  startBoost: number;
  /**
   * Multiplikator auf die Flare-Spoof-Chance (1 = normal, 0 = unempfindlich).
   * IR ~1.0–1.15, ARH ~0.25–0.4, SAM ~0.85
   */
  flareSpoofMult: number;
}

export const MISSILE_CATALOG: Record<MissileDefId, MissileDef> = {
  aim9: {
    id: 'aim9',
    label: 'AIM-9 Sidewinder',
    seekerType: 'ir',
    visualId: 'aim9',
    speed: 720,
    life: 8.5,
    turnRate: 4.2,
    damage: 62,
    proximityRadius: 26,
    lockLoseAngleDeg: 78,
    boostTime: 1.35,
    leadGain: 0.48,
    startBoost: 38,
    flareSpoofMult: 1.15,
  },
  aim120: {
    id: 'aim120',
    label: 'AIM-120 AMRAAM',
    seekerType: 'arh',
    visualId: 'aim120',
    speed: 860,
    life: 14,
    turnRate: 3.2,
    damage: 78,
    proximityRadius: 32,
    lockLoseAngleDeg: 92,
    boostTime: 2.1,
    leadGain: 0.62,
    startBoost: 48,
    flareSpoofMult: 0.3,
  },
  aim54: {
    id: 'aim54',
    label: 'AIM-54 Phoenix',
    seekerType: 'arh',
    visualId: 'aim120',
    speed: 900,
    life: 16,
    turnRate: 2.6,
    damage: 95,
    proximityRadius: 38,
    lockLoseAngleDeg: 88,
    boostTime: 2.4,
    leadGain: 0.68,
    startBoost: 55,
    flareSpoofMult: 0.25,
  },
  r77: {
    id: 'r77',
    label: 'R-77',
    seekerType: 'arh',
    visualId: 'r77',
    speed: 840,
    life: 13,
    turnRate: 3.35,
    damage: 76,
    proximityRadius: 31,
    lockLoseAngleDeg: 90,
    boostTime: 2.0,
    leadGain: 0.6,
    startBoost: 46,
    flareSpoofMult: 0.32,
  },
  r73: {
    id: 'r73',
    label: 'R-73',
    seekerType: 'ir',
    visualId: 'r77',
    speed: 700,
    life: 8,
    turnRate: 4.4,
    damage: 58,
    proximityRadius: 25,
    lockLoseAngleDeg: 80,
    boostTime: 1.25,
    leadGain: 0.46,
    startBoost: 36,
    flareSpoofMult: 1.12,
  },
  enemy_ir: {
    id: 'enemy_ir',
    label: 'Hostile IR',
    seekerType: 'ir',
    visualId: 'aim9',
    speed: 430,
    life: 14,
    turnRate: 1.85,
    damage: 42,
    proximityRadius: 34,
    lockLoseAngleDeg: 95,
    boostTime: 2.4,
    leadGain: 0.38,
    startBoost: 55,
    flareSpoofMult: 1.0,
  },
  sam_std: {
    id: 'sam_std',
    label: 'SAM',
    seekerType: 'sam',
    visualId: 'aim120',
    speed: 380,
    life: 16,
    turnRate: 1.55,
    damage: 48,
    proximityRadius: 40,
    lockLoseAngleDeg: 100,
    boostTime: 2.8,
    leadGain: 0.32,
    startBoost: 40,
    flareSpoofMult: 0.85,
  },
};

/** Standard-Spielerwaffe pro Jet (visuell + spielerisch) */
export function missileDefForJet(jetId: string): MissileDef {
  switch (jetId) {
    case 'f35':
      return MISSILE_CATALOG.aim120;
    case 'f14':
      return MISSILE_CATALOG.aim54;
    case 'su57':
    case 'su34':
      return MISSILE_CATALOG.r77;
    case 'su25':
      return MISSILE_CATALOG.r73;
    case 'elite':
      return MISSILE_CATALOG.aim9;
    case 'l39':
      return MISSILE_CATALOG.aim9;
    case 'f16':
    default:
      return MISSILE_CATALOG.aim9;
  }
}

export function getMissileDef(id: MissileDefId): MissileDef {
  return MISSILE_CATALOG[id] ?? MISSILE_CATALOG.aim9;
}
