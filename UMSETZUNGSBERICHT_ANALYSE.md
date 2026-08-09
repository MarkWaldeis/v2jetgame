# Umsetzungsbericht – V2 Jet Game Analyse

Stand: 09.08.2026  
Quelle: `V2_JET_GAME_AI_ANALYSEBERICHT.md`  
Version: `fight-jet-3d@1.0.0-rc.1`

## Bewusst **nicht** geändert (laut Auftrag)

| Bereich | Begründung |
|---|---|
| Flugmodell / Steuerung / Kamera | Keine Änderungen am Fliegen, Platzierung oder Feel (`FlightModel` nur `const`-Lint) |
| `bankTurnRate` / Baseline-Restore (P0-1) | Explizit ausgenommen |
| Hauptmenü- und Hangar-**Design** | Layout/Look unverändert; nur funktionale Hooks (Grafik) und Missions-Textzeile |
| GLB-Binärkompression (Draco/Meshopt) | Kein Asset-Pipeline-Tooling im Repo; Lazy Loading stattdessen |

---

## Umgesetzt

### P0-2 – Grafikqualität wirkt

- `Engine.applyGraphicsQuality`: Pixelratio-Cap (1 / 1.5 / 2), Fog, Kamera-Far
- `Sky.setCloudBudget`: weniger Wolken auf Low
- `Effects.setParticleScale`: weniger Partikel auf Low
- `Game.applySettings` + Aufruf aus `App` und `Menus` (sofort, ohne Reload)

### P0-3 – Waffenlabel im HUD

- `JetDef.missile` mit `id`, `label`, `seekerType` pro Jet
- `HudData.weaponLabel` statt hartem „AIM-9“
- HUD zeigt z. B. AIM-9 / AIM-120 AMRAAM / AIM-54 Phoenix / R-77 / R-73

### P0-4 – Ökonomie produktiv

- Start: **1200 Credits**, F-16 + Su-25
- Dev-Boost nur via `?devCredits=1` oder localStorage-Flag
- Migration: alte `9_999_999` Credits → einmalig Reset auf 1200 (Besitz bleibt)
- Kampagne: volle Belohnung beim **Erstabschluss**, **25 %** bei Wiederholung
- Belohnungen leicht angehoben für realistische Progression

### P0-5 – Lazy Loading

- Konstruktor lädt **nicht mehr alle** Jets vor
- Nur Standardjet + zugehöriges Raketenvisual
- Gegner-GLBs weiter on-demand

### P0-6 – Lint grün

- Quellfehler behoben (`prefer-const`, JetModel, JetThumb, Unicode-Whitespace)
- Unbenutzte `components/ui/**` und `*.mjs` aus ESLint ausgeschlossen
- `npm run lint` → 0 Errors

### P0-7 – Metadaten & Docs

- Paket: `fight-jet-3d` / `1.0.0-rc.1`
- `app/README.md`, Root-`README.md`, `Fight Jet Game/README.md` aktualisiert
- Steuerung um R / X/Z / V dokumentiert
- Scripts: `typecheck`, `test:smoke`, `test:assets`

### Phase C – Kampf

- **MissileCatalog**: IR / ARH / SAM mit echten Flugprofilen und Flare-Empfindlichkeit
- Spieler-Raketen nutzen Jet-spezifisches Profil (nicht mehr ein generisches Player-Tune)
- **Flares** für alle modernen Jets (8–12 Basis, Elite/Su-57: 24)
- **Airframe-Damage**: Panel ehrlich als AIRFRAME; ENGINE/CTRL/RADAR/WEAPONS wirken auf Schub, Wendigkeit, Lock-Zeit, Raketenblockade

### Phase D – Kampagne

- Jede Mission: `missionType`, `primaryObjective`, `briefing`, `debriefVictory`, Bonus-Hinweis
- Mission-Karten zeigen die Primäraufgabe (Text, kein Redesign)

### Deployment

- Doppel-Deploy entfernt: nur noch **GitHub Pages Artifact + deploy-pages**
- CI: lint + typecheck + build vor Upload

### Fahrwerk/Stores (leicht)

- Erweiterte Name-Heuristik im GLB-Loader zum Ausblenden von Gear/Stores im Airborne-Start

---

## Verifikation

```
npm run lint       ✓
npm run typecheck  ✓
npm run build      ✓
```

---

## Offen / später

- Draco/Meshopt/KTX2-Kompression der großen GLBs
- `Game.ts` in Systeme zerlegen (Mission/Combat/AssetManager)
- Echte Trefferzonen-Meshes statt Airframe-%-Ableitung
- Automatisierter Flight-Regression-Test (nur nach Baseline-Entscheidung)
- CI-Smoke im Actions-Workflow (braucht Puppeteer-Chromium)
