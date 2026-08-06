# 🛩️ Fight Jet 3D

Browserbasiertes 3D-Kampfjet-Spiel: F-16 „Viper" im USAF-Look fliegen, 3-Wellen-Mission
mit KI-Bandits und SEAD gegen SAM-Stellungen, Bordkanone + AIM-9 mit Lock-On,
Nachbrenner, Cockpit-Interior und Avionik-HUD.

**Live spielen:** https://markwaldeis.github.io/fight-jet-3d/

## Stormbreak Archipelago

- **42 × 42 km Open World** mit fünf Vulkaninseln, Caldera, Fjord-Canyon und mehreren Flugrouten
- Gerstner-Ozean mit Fresnel-Reflexion, Tiefenfärbung, Uferschaum und Gischt bei extremem Tiefflug
- Slope-basiertes Terrain-Shading mit Basalt, Dschungel, Strand, Gipfelgestein und distanzabhängigen Micro-Normals
- Naval Air Station mit 2,75-km-Landebahn, Hangar-LOD, Kontrollturm, Radar, Tanklager und Infrastruktur
- Instanzierte Siedlungen, Vegetation, Felsen und Strommasten für stabile Draw-Call-Kosten

## V2-Features

- **Detail-F-16 im USAF-Look**: Roundels, Tailcode „SW", Blasenhaube mit Rahmen,
  Pilot mit Helm/Visier, Düsenlamellen, Shock-Diamonds im Nachbrenner, Nav-Lights,
  Formation-Lights, ventrale Finnen, Gun-Port, Panel-Lines-Textur
- **Cockpit-Interior** (Taste C): Instrumentenpanel mit Radar- & Engine-MFD,
  HUD-Combiner-Glas, Ejection Seat, Sidestick, Throttle, Seitenkonsolen
- **Missionsmodus**: 3 Wellen — Luftüberlegenheit → Banditen-Schwarm → SEAD
  (4 SAM-Stellungen zerstören). SAMs feuern Lenkraketen auf den Spieler (MISSILE-Warnung)
- Lock-On funktioniert auf Luftziele **und** Bodenziele

## Mission (V2)

| Welle | Inhalt |
|---|---|
| 1 | Luftüberlegenheit — 3 Bandits |
| 2 | Banditen-Schwarm — 5 Bandits |
| 3 | SEAD — 4 Bandits + 4 SAM-Stellungen |

Lock-On funktioniert auf Luft- **und** Bodenziele. Sieg = alle Wellen geschafft.

## Steuerung (War Thunder Mouse-Aim)

| Taste | Aktion |
|---|---|
| **Maus** | Virtual Aim Point — Jet fliegt FBW zum Zielkreuz |
| S / W (Pfeile) | Pitch — **S = Ziehen (max G)** / W = Drücken (Manual Override) |
| A / D | Rollen (Manual Override) |
| Q / E | Seitenruder (Feinkorrektur) |
| Shift / Strg / Mausrad | Schub 0–100 % |
| Tab (oder Vollschub) | WEP / Nachbrenner (~110 %) |
| B | Luftbremse |
| Leertaste | Bordkanone |
| F oder M | AIM-9-Rakete (nach Lock-On) |
| **C halten** oder **RMB** | Free-Look (Orbit); Jet behält Kurs |
| V | Cockpit- / Chase-Kamera |
| P / Esc | Pause |
| Enter | Start / Neustart |

**Mouse-Aim:** Maus steuert das grüne Zielkreuz; der Jet rollt zuerst (Roll-to-Turn), dann zieht er Richtung Aim-Punkt. WASD deaktiviert FBW temporär (Manual Stick), beim Loslassen übernimmt Mouse-Aim weich wieder.

**HUD-Reticles:** Maus-Zielkreuz · Velocity Vector (Flugbahn) · Gun Crosshair (Nase)

**Lock-On:** Feind im Suchkegel halten, bis „LOCK" erscheint, dann F drücken.

## Entwicklung

```bash
cd app
npm install
npm run dev      # http://localhost:3000
npm run build    # Produktions-Build → app/dist
```

## Tech

- **Three.js** (WebGL) — detailliertes F-16 aus Primitiven + Canvas-Texturen (Roundels, Panels, MFDs)
- **Vite + React + TypeScript** — React rendert HUD/Menüs, Three.js die Welt
- Prozedurales Terrain (FBM-Heightmap), animiertes Meer, Wolken, Himmels-Shader
- Arcade-Flugmodell (Quaternion-Rotation, Stall, Speed-FOV)
- KI-Gegner mit Zustandsautomat (Patrouille / Verfolgung / Angriff / Ausweichen)
- Missionsmodus: Wellen, SAM-Sites mit Radar + Gegenfeuer
- Prozedurales WebAudio (Triebwerk, Lock-On, Kanone, Explosionen)
- Deployment: GitHub Actions → GitHub Pages

Siehe [GAME_PLAN.md](GAME_PLAN.md) für Architektur & Roadmap.
