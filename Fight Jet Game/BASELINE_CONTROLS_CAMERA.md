# BASELINE — Steuerung, Kamera & Fluggefühl (FROZEN)

**Status: PERFEKT — nicht ändern, ohne explizite User-Freigabe.**

Gespeichert am: **2026-08-02**  
Git-Commit (Referenz): `fe78fde` und Nachfolger mit diesem Snapshot  
Live: https://markwaldeis.github.io/fight-jet-3d/

Wenn etwas „kaputt getuned“ wurde: Werte aus diesem Dokument bzw. aus  
`app/src/game/config.baseline.json` und dem Abschnitt in `app/src/game/config.ts` wiederherstellen.

---

## 1. Steuerungs-Mapping (Input)

| Eingabe | Aktion |
|--------|--------|
| **Maus** | Mouse-Aim / Virtual Aim Point (FBW) |
| **S** / Pfeil ↓ | Pitch Up (Ziehen, max G) |
| **W** / Pfeil ↑ | Pitch Down (Drücken) |
| **A** / Pfeil ← | **Reines Rollen links** (nur Längsachse, kein Heading-Zwang) |
| **D** / Pfeil → | **Reines Rollen rechts** |
| **Q** / **E** | Seitenruder (Yaw) |
| **Shift** / **Ctrl** | Schub hoch / runter |
| **Mausrad** | Schub |
| **Tab** oder Vollgas | WEP / Afterburner |
| **B** | Luftbremse |
| **Leertaste** | Kanone |
| **F** / **M** | Rakete (nach Lock) |
| **C halten** oder **RMB** | Free-Look (halten) |
| **V** | Cockpit / Chase umschalten |
| **P** / **Esc** | Pause |

### Verhalten

- **Mouse-Aim FBW** aktiv, solange keine Manual-Taste und kein Free-Look.
- **WASD / QE** = Manual Override → FBW aus; beim Loslassen **Smooth Recapture** (`fbwRecaptureRate: 4.5`).
- **A/D** = nur Roll um die eigene Achse (`rollYawCoupling: 0`, `bankTurnRate: 0`).
- Roll mit **Trägheit**: `rollAccel: 9.5`, `rollDamping: 4.2`, `rollRate: 2.15`.

---

## 2. Flugphysik (`CONFIG.flight`) — Frozen Values

```js
minSpeed: 55
cruiseSpeed: 140
maxSpeed: 260
afterburnerSpeed: 320
thrustAccel: 42
afterburnerAccel: 70
dragBase: 0.012
inducedDrag: 0.045
aoaDrag: 0.08

pitchRate: 1.55
rollRate: 2.15
yawRate: 0.5
rollAccel: 9.5
rollDamping: 4.2

fbwRollGain: 3.2
fbwPitchGain: 2.6
fbwYawGain: 0.55
fbwRollPriority: 0.35
fbwRecaptureRate: 4.5
aimMargin: 0.92
aimSensitivity: 0.00135

velocityAlignRate: 2.8
maxAoa: 0.55
angularDamping: 3.5

rollYawCoupling: 0      // WICHTIG: A/D kein Seitwärtsdrehen
bankTurnRate: 0         // WICHTIG: s.o.
autoLevelRate: 1.2
stallPitchDrop: 0.95
gravityPull: 9.81
```

### Flugmodell-Verhalten (Code-Logik, nicht nur Zahlen)

- Nase ≠ Velocity Vector (AoA / Sideslip).
- Position entlang **Velocity Vector**.
- FBW: Roll-to-Turn, dann Pitch; Yaw nur Feinkorrektur.
- Energy Bleed: Induced Drag bei High-G / AoA.
- Stall unter `minSpeed`, weichere Ruder, Nase fällt.
- Roll: `rollOmega` mit Beschleunigung/Dämpfung (kein harter Rate-Sprung).

Dateien: `app/src/game/aircraft/FlightModel.ts`, `app/src/game/core/Input.ts`, `app/src/game/aircraft/PlayerJet.ts`

---

## 3. Kamera (`CONFIG.camera`) — Frozen Values

```js
// Nah von hinten-oben
chaseOffset: { x: 0, y: 4.8, z: 7.5 }
chaseLookAhead: 140
lookDownAngle: 0.18

// Dynamische Roll-Mitnahme
chaseRollFollow: 0.14        // ruhig / geradeaus
chaseRollFollowMax: 0.42     // bei aktivem A/D
rollCamResponse: 6.5
rollLateralOffset: 1.35

lerpPos: 9.5                 // Position enger
lerpRot: 6.5                 // Bank träger (Lag)

freeLookReturnTime: 0.3
speedPullBack: 1.8
highGPullIn: 1.5
baseFov: 60
maxFovBoost: 18
freeLookDistance: 12
freeLookSensitivity: 0.004

shakeSpeed: 0.012
shakeFire: 0.035
shakeStall: 0.045
shakeWep: 0.02
```

### Kamera-Verhalten

- Chase: hinter + **über** dem Jet, **nah** (`z≈7.5`, `y≈4.8`).
- Horizon-Lock mit **dynamischer** Roll-Kopplung (Bank + Roll-Rate).
- Seitlicher Versatz bei Bank (`rollLateralOffset`).
- Free-Look: C/RMB halten → Return-Slerp 0.3 s.
- Per-Jet `camFit` aus Modellgröße (`Aircraft.computeCamFit`).
- Min. Chase-Distanz im Code: **5 m**.

Datei: `app/src/game/aircraft/CameraController.ts`

---

## 4. HUD / Reticles

- **Reticle 1**: Maus-Zielkreuz (NDC Aim)
- **Reticle 2**: Velocity Vector
- **Reticle 3**: Gun Crosshair aus echten Mündungen (`getGunBoresight`)
- System-Cursor im Play-Mode ausgeblendet

Datei: `app/src/components/Hud.tsx`, `app/src/game/Game.ts`

---

## 5. Wiederherstellen

1. `app/src/game/config.ts` → Flight- und Camera-Blöcke aus `config.baseline.json` / diesem Doc kopieren.
2. Nicht erneut `rollYawCoupling` / `bankTurnRate` > 0 setzen (bricht A/D-Feel).
3. Chase-Offset nicht ohne Not auf „weit hinten“ (z > 10) oder „flach“ (y < 3.5) drehen.
4. Nach Restore: lokal testen, dann pushen.

---

## 6. Was bewusst NICHT mehr drin ist

- A/D als Arcade-Kurvenflug (Welt-Yaw aus Bank) — entfernt, User wollte reines Rollen.
- Sehr weite Chase-Cam (früher z≈12–14) — ersetzt durch Nah-Cam von hinten-oben.

---

*Dieses Baseline-Dokument und `config.baseline.json` sind die kanonische Referenz für „passt perfekt“.*
