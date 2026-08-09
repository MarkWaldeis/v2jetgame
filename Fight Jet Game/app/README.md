# Fight Jet 3D (`fight-jet-3d`)

Browserbasiertes Singleplayer-Jet-Combat (Three.js + React + TypeScript + Vite).

**Live:** [https://markwaldeis.github.io/v2jetgame/](https://markwaldeis.github.io/v2jetgame/)

Version: `1.0.0-rc.1` · Ziel: Singleplayer Jet Combat Campaign (kein Multiplayer / kein War-Thunder-Klon).

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

## Steuerung

| Taste | Aktion |
|---|---|
| **Maus** | Virtual Aim Point (FBW) |
| S / W | Pitch (Manual Override) |
| A / D | Rollen |
| Q / E | Seitenruder |
| Shift / Strg / Mausrad | Schub |
| Tab | Nachbrenner / WEP |
| B | Luftbremse |
| Leertaste | Bordkanone |
| **F** oder **M** | Lenkwaffe (nach Lock-On) |
| **R** | Kanonen nachladen |
| **X** oder **Z** | Flares |
| **C halten** / RMB | Free-Look |
| **V** | Cockpit- / Chase-Kamera |
| P / Esc | Pause |
| Enter | Start / Neustart (Menü) |

## Browser

Desktop mit WebGL 2 (Chrome, Edge, Firefox empfohlen). Mobile/Touch und Multiplayer sind nicht Ziel von v1.

## Grafikqualität

Einstellungen → Low / Medium / High steuern Pixelratio, Wolkenanzahl, Partikel und Sichtweite **ohne Reload**.

## Ökonomie

- Start: **1200 Aero Credits**, Startjets F-16 + Su-25
- Kampagne: volle Belohnung beim Erstabschluss, **25 %** bei Wiederholung
- Alter Dev-Boost (`9_999_999`) wird einmalig auf Startcredits migriert
- Debug: `?devCredits=1` in der URL

## Lazy Loading

Beim Start wird nur der gewählte Jet (+ Raketenvisual) geladen. Weitere Jets und Gegner-GLBs laden on-demand.

## Asset-Hinweise

GLB-Modelle unter `public/models/` und `public/weapons/`. Lizenzen der Drittanbieter-Modelle beim jeweiligen Lieferanten prüfen; Projekt-Screenshots und UI sind eigene Arbeit.

## Bekannte Einschränkungen

- Kein Multiplayer
- Subsystem-Schaden folgt dem Airframe-HP (keine echten Trefferzonen-Meshes)
- GLB-Kompression (Draco/Meshopt) ist optional und noch nicht flächendeckend
- Flugphysik/Kamera gelten als abgenommenes Feel — Baseline-Dokumentation kann abweichen; siehe `BASELINE_CONTROLS_CAMERA.md`
