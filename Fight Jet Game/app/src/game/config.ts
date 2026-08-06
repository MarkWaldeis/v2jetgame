// Zentrale Balance- und Konstanten-Datei für Fight Jet 3D.
// War Thunder–inspiriertes Mouse-Aim / Arcade-Realistic Hybrid.
//
// ═══════════════════════════════════════════════════════════════════════════
//  BASELINE FROZEN (User: „passt perfekt“ — 2026-08-02)
//  flight + camera unten sind freigegebene Feel-Werte.
//  Snapshot: ./config.baseline.json  +  ../../BASELINE_CONTROLS_CAMERA.md
//  Nicht ohne explizite Freigabe anfassen (bes. rollYawCoupling=0, chaseOffset).
// ═══════════════════════════════════════════════════════════════════════════

export const CONFIG = {
  world: {
    size: 42000,           // Stormbreak-Kantenlänge in m (42 x 42 km)
    segments: 448,         // Heightfield-Auflösung
    maxHeight: 2750,       // Vulkan-/Berggipfel in m
    seaLevel: 0,
    fogNear: 1400,
    fogFar: 34000,
  },
  // ─── Flight feel (langsamer + freieres Zielen) ─────────────────────────
  flight: {
    // --- Geschwindigkeiten (m/s) — alle Jets spürbar langsamer ---
    minSpeed: 48,          // Stall-Schwelle
    cruiseSpeed: 112,
    maxSpeed: 200,
    afterburnerSpeed: 245, // WEP
    thrustAccel: 34,
    afterburnerAccel: 55,
    dragBase: 0.012,
    /** Induzierter Widerstand pro G über 1 (etwas weniger Energy-Bleed) */
    inducedDrag: 0.038,
    /** Geschwindigkeitsverlust bei hohem AoA (zusätzlich) */
    aoaDrag: 0.07,

    // --- Ruder-Raten: Pitch/Yaw stark (Zielen), Roll eher ruhig ---
    pitchRate: 2.15,
    rollRate: 1.85,        // weniger „Durchdrehen“
    yawRate: 1.05,         // seitlich mit der Maus mitgehen
    /** Roll-Winkelbeschleunigung (rad/s²) */
    rollAccel: 8.5,
    /** Roll-Dämpfung ohne Eingabe (1/s) — Schräglage klingt schneller ab */
    rollDamping: 5.5,

    // --- Mouse-Aim: Nase/Kanone folgt Maus (wenig Rollen, mehr Pitch/Yaw) ---
    fbwRollGain: 1.2,      // nur leichte Bank-Hilfe, kein Spin
    fbwPitchGain: 4.2,     // Nase hoch/runter zum Mauspunkt
    fbwYawGain: 1.35,      // Nase seitlich zum Mauspunkt
    /** Kaum noch „erst rollen“ — Zielen per Nase */
    fbwRollPriority: 0.85,
    /** Weiche Rückkehr nach Manual-Override (1/s) */
    fbwRecaptureRate: 6.0,
    /** Max. Aim-Reticle-Abstand vom Bildschirmrand (NDC, 0..1) */
    aimMargin: 0.95,
    /** Aim-Cursor (Pointer-Lock) */
    aimSensitivity: 0.0017,

    // --- Velocity / AoA ---
    /** Nase folgt der Velocity etwas knackiger */
    velocityAlignRate: 3.2,
    /** Max. Anstellwinkel (rad) — etwas mehr Spielraum beim Ziehen */
    maxAoa: 0.62,
    /** Angular damping etwas weicher = freieres Steuern */
    angularDamping: 2.9,

    // A/D nur reines Rollen — kein Heading aus Bank (Kurven = Roll + Pitch/S)
    rollYawCoupling: 0,
    bankTurnRate: 0,
    /** Weniger Auto-Level → Schräglage hält besser beim Zielen */
    autoLevelRate: 0.85,
    stallPitchDrop: 0.9,
    gravityPull: 9.81,
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
  },
  mission: {
    waves: [
      {
        bandits: 3,
        sams: 0,
        speedScale: 0.4,
        enemyMissiles: false,
        label: 'WELLE 1 · TRAINING — Langsame Banditen',
      },
      {
        bandits: 3,
        sams: 0,
        speedScale: 1,
        enemyMissiles: true,
        label: 'WELLE 2 — Luftüberlegenheit',
      },
      {
        bandits: 5,
        sams: 0,
        speedScale: 1,
        enemyMissiles: true,
        label: 'WELLE 3 — Banditen-Schwarm',
      },
      {
        bandits: 4,
        sams: 4,
        speedScale: 1,
        enemyMissiles: true,
        label: 'WELLE 4 — SEAD: Zerstöre die SAM-Stellungen',
      },
    ],
    waveDelay: 3.5,
    samHp: 40,
    samRange: 3500,
    samFireInterval: 9,
    samMissileDamage: 35,
  },
} as const;

export type Config = typeof CONFIG;
