# Fight Jet 3D — v2

Browserbasiertes 3D-Kampfjet-Spiel (Singleplayer Campaign): acht Jets, zwei Karten, Kanone + Lenkwaffen, SAM/AAA, Flares, Hangar und lokale Progression.

## Direkt spielen

**[https://markwaldeis.github.io/v2jetgame/](https://markwaldeis.github.io/v2jetgame/)**

Desktop-Browser mit WebGL (Chrome, Edge, Firefox). Kein Download nötig.

## Projektstruktur

| Ordner | Inhalt |
|---|---|
| `Fight Jet Game/app` | Haupt-App (Three.js + React + TypeScript + Vite) |
| `Fight Jet Game/archived-aircraft` | Archivierte Legacy-Modelle |
| `V2_JET_GAME_AI_ANALYSEBERICHT.md` | Reife- und Umsetzungsbericht |

Details, Steuerung und Scripts: [Fight Jet Game/app/README.md](Fight%20Jet%20Game/app/README.md)

## Entwicklung

```bash
cd "Fight Jet Game/app"
npm install
npm run dev
npm run lint
npm run typecheck
npm run build
```

Deployment: GitHub Actions → **GitHub Pages** (offizieller Artifact/Deploy-Pfad, ein Workflow).

## Steuerung (Kurz)

Maus-Aim · WASD · Leertaste Kanone · F/M Rakete · **R** Reload · **X/Z** Flares · **V** Cockpit · **C**/RMB Free-Look · P/Esc Pause

## Credits / Hinweise

Spielcode und UI: Projekt „v2jetgame“. Externe GLB-Flugzeug-/Waffenmodelle unterliegen den Lizenzen ihrer Quellen. Keine realen Militärdaten — Arcade-Flight-Combat.
