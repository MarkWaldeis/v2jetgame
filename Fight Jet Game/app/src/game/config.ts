// Zentrale Balance- und Konstanten-Datei für Fight Jet 3D.
// Mouse-Aim: Nase/Kanone folgt der Maus (Gun-Follow-Mouse) — Pitch + Yaw.
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
  // ─── Flight feel (Gun-Follow-Mouse + Energie) ──────────────────────────
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

    // --- Ruder: snappy genug, dass die Nase der Maus folgt ---
    pitchRate: 1.55,
    rollRate: 1.95,
    yawRate: 1.05,         // seitlich mit der Maus mitgehen
    rollAccel: 9.5,
    rollDamping: 4.2,

    // --- Mouse-Aim FBW: Nase folgt Maus (wenig Rollen, stark Pitch/Yaw) ---
    fbwRollGain: 1.2,      // nur leichte Bank-Hilfe
    fbwPitchGain: 4.2,     // Nase hoch/runter zum Mauspunkt
    fbwYawGain: 1.35,      // Nase seitlich zum Mauspunkt
    /** höher = mehr direkter Yaw statt Roll-to-Turn */
    fbwRollPriority: 0.85,
    fbwRecaptureRate: 6.0,
    aimMargin: 0.95,
    aimSensitivity: 0.0017,

    /**
     * Soft Aim-Assist: Aim-Richtung wird leicht zum Lead des nächsten
     * Gegners gezogen (leichter treffen, ohne Auto-Aim).
     */
    aimAssistConeDeg: 14,
    aimAssistStrength: 0.38,
    aimAssistRange: 1150,
    aimAssistMinDot: 0.55,

    // --- Velocity / AoA (Nase ≠ Velocity) ---
    velocityAlignRate: 2.6,
    maxAoa: 0.52,
    angularDamping: 3.4,

    /** A/D = reines Rollen, kein Heading-Zwang */
    coordTurnYaw: 0,
    bankTurnRate: 0,
    rollYawCoupling: 0,

    autoLevelRate: 1.2,
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
    hp: 60,
    speed: 95,
    turnRate: 0.7,
    cannonDamage: 2,
    fireRange: 750,
    fireConeDeg: 8,
    burstLength: 0.5,
    thinkInterval: 0.25,
    respawnDelay: 6,
    skillEvasionChance: 0.28,
    /** Globaler Multiplikator auf Gegner-Geschwindigkeit (Lead leichter verfolgen) */
    speedScale: 0.48,
    /** Luft-Luft-Raketen gegen Spieler */
    missileRange: 2100,
    missileConeDeg: 28,
    /** Pause zwischen Gegner-Raketen (s) — genug Zeit für Flares */
    missileCooldown: 14,
    /** Min. Distanz, damit sie nicht sofort-Hits machen */
    missileMinRange: 380,
    /**
     * Pro Welle: nur EIN Bandit darf Raketen schießen,
     * und nur so viele Schüsse insgesamt.
     */
    missilesPerWave: 2,
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
    chaseRollFollow: 0.14,
    /** Max. Roll-Kopplung bei aktivem A/D-Rollen */
    chaseRollFollowMax: 0.42,
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
