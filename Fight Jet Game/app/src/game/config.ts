// Zentrale Balance- und Konstanten-Datei für Fight Jet 3D.
// War Thunder–inspiriertes Mouse-Aim: realistisches Roll-to-Turn + Soft-Assist.
//
// Flight (2026-08): realistischer Look (Bank, AoA, Climb/Dive-Energy, Wind),
// Soft Aim-Assist auf Gegner-Lead (kein reines Gun-Follow-Mouse).
// Camera-Baseline: ./config.baseline.json

export const CONFIG = {
  world: {
    size: 42000,           // Stormbreak-Kantenlänge in m (42 x 42 km)
    segments: 448,         // Heightfield-Auflösung
    maxHeight: 2750,       // Vulkan-/Berggipfel in m
    seaLevel: 0,
    fogNear: 1400,
    fogFar: 34000,
  },
  // ─── Flight feel (realistischer Roll-to-Turn + Energie) ────────────────
  flight: {
    // --- Geschwindigkeiten (m/s) ---
    minSpeed: 52,
    cruiseSpeed: 128,
    maxSpeed: 235,
    afterburnerSpeed: 290,
    thrustAccel: 38,
    afterburnerAccel: 62,
    dragBase: 0.0135,
    /** Induced Drag — spürbarer Energy-Bleed in Kurven */
    inducedDrag: 0.048,
    /** AoA-Drag */
    aoaDrag: 0.085,

    // --- Ruder (stabiler Stand vor Aim-Experimenten) ---
    pitchRate: 1.48,
    rollRate: 2.05,
    yawRate: 0.55,
    rollAccel: 9.2,
    rollDamping: 4.4,

    // --- Mouse-Aim FBW: klassisches Roll-to-Turn (nicht übersteuert) ---
    fbwRollGain: 3.0,
    fbwPitchGain: 2.45,
    fbwYawGain: 0.48,
    /** 0 = zuerst rollen, 1 = mehr direkter Yaw */
    fbwRollPriority: 0.32,
    fbwRecaptureRate: 4.2,
    aimMargin: 0.92,
    aimSensitivity: 0.0014,

    /** Soft Aim-Assist aus (kein Magnet zu Gegnern) */
    aimAssistConeDeg: 14,
    aimAssistStrength: 0,
    aimAssistRange: 1150,
    aimAssistMinDot: 0.55,

    // --- Velocity / AoA ---
    velocityAlignRate: 2.35,
    maxAoa: 0.52,
    angularDamping: 3.4,

    /**
     * Koordinierte Kurve — moderate Werte (starke Werte = unkontrolliertes „Ziehen“).
     */
    coordTurnYaw: 0.42,
    bankTurnRate: 0.55,
    rollYawCoupling: 0,

    autoLevelRate: 1.15,
    stallPitchDrop: 0.95,
    gravityPull: 9.81,

    /**
     * Energie-Management (m/s² entlang Climb):
     * Steigen bremst, Sinken beschleunigt — spürbar, aber fair.
     */
    climbBrake: 36,
    diveAccel: 40,
    /** Extra Gravity-Anteil auf Velocity bei Steigflug */
    climbGravityExtra: 0.55,
  },
  player: {
    hp: 100,
    cannonDamage: 4,
    cannonRange: 900,
    cannonSpread: 0.012,
    cannonRPM: 3000,
    /** Geschossgeschwindigkeit (m/s) — etwas höher → kleinerer Vorhalt, leichter zielen */
    bulletSpeed: 1050,
    /** Max. Kanonen-Munition */
    cannonAmmo: 500,
    /** Nachladezeit (s) mit Taste R */
    reloadTime: 3.5,
    /** Optionaler leichter Geschossabfall (m/s²) */
    bulletGravity: 3,
    missileCount: 6,
    lockRange: 2500,
    lockAngleDeg: 18,
    lockTime: 1.4,
    flareCount: 8,
    /** Pause zwischen Flare-Salven (s) */
    flareCooldown: 1.1,
    /** Sichtbare IR-Wolke / Spoof-Fenster nach Auswurf (s) */
    flareCloudDuration: 3.2,
    /**
     * Chance, dass eine eingehende Lenkwaffe den Lock verliert (pro Salve).
     * War-Thunder-Feel: ~50/50 bei korrektem Timing.
     */
    flareSpoofChance: 0.5,
  },
  enemy: {
    count: 4,
    hp: 48,
    speed: 88,
    turnRate: 0.65,
    /** Schwache Kanone — fair für Einsteiger */
    cannonDamage: 1.35,
    fireRange: 620,
    fireConeDeg: 6.5,
    burstLength: 0.32,
    thinkInterval: 0.28,
    respawnDelay: 6,
    skillEvasionChance: 0.22,
    /**
     * Globaler Speed-Mult (mit Floor in EnemyJet).
     * Früher 0.48 × Wave 0.38 → Stall/Stehen; jetzt flugfähig & langsam.
     */
    speedScale: 0.58,
    /** Luft-Luft-Raketen gegen Spieler (selten, langsam) */
    missileRange: 1700,
    missileConeDeg: 22,
    /** Lange Pause zwischen Gegner-Raketen */
    missileCooldown: 18,
    missileMinRange: 480,
    /** Pro Welle: max. 1 Bandit, 1–2 Schüsse */
    missilesPerWave: 1,
  },
  missile: {
    speed: 780,
    life: 10,
    turnRate: 3.8,          // rad/s — knackig, aber nicht unnatürlich
    damage: 70,
    proximityRadius: 28,
    lockLoseAngleDeg: 85,
    /** Boost-Phase (s) — starke Beschleunigung vom Pylon weg */
    boostTime: 1.6,
    /** Seitlicher/Unterer Drop vom Hardpoint (m/s) */
    ejectSpeed: 12,
    /** Lead-Pursuit: Vorhalt auf Zielgeschwindigkeit */
    leadGain: 0.55,
    /**
     * Langsamere Profile für Feind-/SAM-Raketen:
     * Spieler hat Zeit für Manöver + Flares (WT-Feel).
     */
    enemy: {
      speed: 430,
      life: 14,
      turnRate: 1.85,
      damage: 42,
      proximityRadius: 34,
      lockLoseAngleDeg: 95,
      boostTime: 2.4,
      leadGain: 0.38,
      startBoost: 55,
    },
    sam: {
      speed: 390,
      life: 16,
      turnRate: 1.55,
      damage: 48,
      proximityRadius: 36,
      lockLoseAngleDeg: 100,
      boostTime: 2.8,
      leadGain: 0.32,
      startBoost: 35,
    },
  },
  // ─── FROZEN camera feel (siehe config.baseline.json) ───────────────────
  camera: {
    // Nah von hinten-oben auf den Jet schauen (dicht am Rumpf)
    // y = Höhe über Jet (m), z = Distanz hinter der Nase (m)
    chaseOffset: { x: 0, y: 4.8, z: 7.5 },
    chaseLookAhead: 140,
    chaseLookY: 0,
    chaseLookZ: 0,
    /** Look-down: Blick von schräg oben auf den Jet + Ziel vor der Nase */
    lookDownAngle: 0.18,
    /** Basis-Roll-Kopplung (ruhig) — Horizont bleibt weitgehend stabil */
    // Mehr Kamera-Mitnahme der Bank → Schräglage sichtbar
    chaseRollFollow: 0.22,
    /** Max. Roll-Kopplung bei aktivem Rollen / Maus-Kurven */
    chaseRollFollowMax: 0.62,
    /** Wie schnell die Kamera-Bank der Jet-Bank folgt (1/s) */
    rollCamResponse: 6.5,
    /** Seitlicher Versatz der Kamera bei Bank (m bei 90°) — fühlt sich „mit“ dem Jet */
    rollLateralOffset: 1.35,
    /** Position spring-damper (höher = enger) */
    lerpPos: 9.5,
    /** Rotation / Bank der Chase-Cam — etwas träger als Position */
    lerpRot: 6.5,
    /** Free-Look Rückschwenk-Dauer (s) */
    freeLookReturnTime: 0.3,
    /** Speed Pull-Back: nur leicht weiter bei WEP */
    speedPullBack: 1.8,
    /** High-G / Airbrake: Kamera rückt näher */
    highGPullIn: 1.5,
    baseFov: 60,
    maxFovBoost: 18,       // → ~78° bei Max-Speed/WEP
    freeLookDistance: 12,
    freeLookSensitivity: 0.004,
    /** Kamera-Shake Amplitude (m / rad) */
    shakeSpeed: 0.012,
    shakeFire: 0.035,
    shakeStall: 0.045,
    shakeWep: 0.02,
  },
  hud: {
    radarRange: 5000,
    radarSize: 210,
  },
  score: {
    kill: 500,
    hitBonus: 25,
    samKill: 300,
    aaaKill: 180,
  },
  mission: {
    /**
     * Fallback-Wellen (wenn keine Kampagne aktiv).
     * Primär steuert CampaignCatalog die Missionen.
     */
    waves: [
      {
        bandits: 2,
        sams: 0,
        speedScale: 0.4,
        enemyMissiles: false,
        label: 'WELLE 1 · TRAINING',
      },
    ],
    waveDelay: 3.2,
    samHp: 40,
    samRange: 3500,
    samFireInterval: 9,
    samMissileDamage: 35,
    /** AAA-Flak-Fahrzeuge */
    aaaHp: 28,
    aaaDamage: 2.8,
    aaaRange: 2400,
    aaaFireInterval: 0.11,
  },
} as const;

export type Config = typeof CONFIG;
