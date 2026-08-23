# Fight Jet 3D

Browserbasiertes 3D-Kampfjet-Spiel (Singleplayer): acht Jets, zwei Karten, Kanone + Lenkwaffen, SAM/AAA, Flares, Hangar und lokale Progression.

**Spielen (GitHub Pages):** [https://markwaldeis.github.io/v2jetgame/](https://markwaldeis.github.io/v2jetgame/)

Desktop-Browser mit WebGL (Chrome, Edge, Firefox). Kein Download, kein Konto.

Erstveröffentlichung: **itch.io** — Anleitung und ZIP: [ITCH_IO.md](ITCH_IO.md)

## Steuerung (Kurz)

Maus-Aim · WASD · Q/E Gier · Shift/Strg Schub · Leertaste Kanone · **R** Reload · **F/M** Rakete · **X/Z** Flares · **B** Fahrwerk/Bremse · **V** Cockpit · **C**/RMB Free-Look · P/Esc Pause

## Entwicklung

```bash
cd "Fight Jet Game/app"
npm install
npm run dev
npm run lint
npm run typecheck
npm run build
npm run package:itch   # erzeugt release/fight-jet-3d-web.zip
```

Deployment: GitHub Actions → GitHub Pages (ein Workflow). itch.io bekommt nur das ZIP, nicht das Repo.

## Ordner

| Pfad | Inhalt |
|---|---|
| `Fight Jet Game/app` | Spiel (Three.js + React + TypeScript + Vite) |
| `Fight Jet Game/app/public` | Modelle, Waffen, Karten — Teil des Builds |
| `Fight Jet Game/archived-aircraft` | Alte Modelle, **nicht** im Spiel |
| `itch-assets` | Cover/Banner für die itch.io-Seite |
| `release/fight-jet-3d-web.zip` | **Das** Upload-Paket (nach `npm run package:itch`) |

## Credits / Lizenz

Spielcode: MIT, siehe [LICENSE](LICENSE). Drittanbieter-GLBs: [CREDITS.md](CREDITS.md). Arcade-Fiction, keine realen Militärdaten.
