# Fight Jet 3D (`fight-jet-3d`)

Browser-based single-player jet combat (Three.js + React + TypeScript + Vite). English UI.

**Live:** [https://markwaldeis.github.io/v2jetgame/](https://markwaldeis.github.io/v2jetgame/)

Version: `1.0.0` · Singleplayer Jet Combat Campaign (kein Multiplayer). itch.io-Paket: `npm run package:itch` → siehe Root [ITCH_IO.md](../../ITCH_IO.md).

## Entwicklung

```bash
npm install
npm run dev        # http://localhost:3000 (siehe vite.config)
npm run typecheck
npm run lint
npm run build
npm run preview
```

Optional:

```bash
npm run test:smoke   # Puppeteer-Smoke (benötigt Chromium)
npm run test:assets  # Hangar/Jet-Ladebericht
```

## Controls

| Key | Action |
|---|---|
| **Mouse** | Aim point (fly-by-wire) |
| S / W | Pitch (manual override) |
| A / D | Roll |
| Q / E | Rudder |
| Shift / Ctrl / mouse wheel | Throttle |
| Tab | Afterburner / WEP |
| B | Gear (air) · brake (ground) |
| Space | Cannon |
| **F** or **M** | Missile (after lock) |
| **R** | Reload cannon |
| **X** or **Z** | Flares |
| **C hold** / RMB | Free-look |
| **V** | Cockpit / chase camera |
| P / Esc | Pause |
| Enter | Start / restart (menu) |

## Browser

Desktop with WebGL 2 (Chrome, Edge, Firefox). Mobile/touch and multiplayer are not in v1.

## Graphics

Settings → Low / Medium / High change pixel ratio, clouds, particles, and view distance **without a reload**.

## Ökonomie

- Start: **1200 Aero Credits**, Startjets F-16 + Su-25
- Kampagne: volle Belohnung beim Erstabschluss, **25 %** bei Wiederholung
- Alter Dev-Boost (`9_999_999`) wird einmalig auf Startcredits migriert
- Debug-Credits (`?devCredits=1`) und „Alle Jets freischalten“ nur im Dev-Server

## Lazy Loading

Beim Start wird nur der gewählte Jet (+ Raketenvisual) geladen. Weitere Jets und Gegner-GLBs laden on-demand.

## Asset-Hinweise

GLB-Modelle unter `public/models/` und `public/weapons/`. Lizenzen der Drittanbieter-Modelle beim jeweiligen Lieferanten prüfen; Projekt-Screenshots und UI sind eigene Arbeit.

## Bekannte Einschränkungen

- Kein Multiplayer
- Subsystem-Schaden folgt dem Airframe-HP (keine echten Trefferzonen-Meshes)
- GLB-Kompression (Draco/Meshopt) ist optional und noch nicht flächendeckend
- Flugphysik/Kamera gelten als abgenommenes Feel — Baseline-Dokumentation kann abweichen; siehe `BASELINE_CONTROLS_CAMERA.md`
