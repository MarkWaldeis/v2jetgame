# 🛩️ FIGHT JET 3D — Masterplan & Mega-Prompt

## 1. Vision

Ein browserbasiertes 3D-Kampfjet-Spiel: Der Spieler steigt in einen amerikanischen Jäger
(F-16 Fighting Falcon als Startflugzeug), fliegt frei über einer großen Landschaft und
bestreitet Dogfights gegen KI-gesteuerte feindliche Jets. Von Anfang an so strukturiert,
dass es später erweiterbar (mehr Flugzeuge, Missionen, Multiplayer) und deploybar ist
(statisches Hosting, z. B. GitHub Pages / Vercel).

## 2. Tech-Stack (festgelegt für Skalierbarkeit + einfaches Deployment)

| Ebene | Wahl | Begründung |
|---|---|---|
| Engine | **Three.js** (WebGL) | Der Standard für 3D im Browser, riesige Community |
| Build | **Vite** + Vanilla JS (ES Modules) | Schnell, deployt als statische Seite |
| Sprache | JavaScript (später optional TypeScript-Migration) | Ein Take, keine Compiler-Hürden |
| Steuerung | Tastatur (WASD/Pfeile) + Maus; Gamepad-Support vorgemerkt | Läuft überall |
| Physik | Eigene Arcade-Flugphysik (kein Schwergewicht wie cannon.js) | Fluggefühl > Realismus |
| Deployment | **GitHub Pages** via `gh-pages`-Branch oder GitHub Actions | Kostenlos, direkt testbar über Link |
| Versionskontrolle | Git + GitHub Repo, jeder Meilenstein wird gepusht | Vom User gewünscht |

## 3. Architektur (modular, von Tag 1 auf Wachstum ausgelegt)

```
Fight Jet Game/
├── index.html
├── package.json / vite.config.js
├── public/
│   └── assets/            # Modelle (GLTF), Texturen, Sounds
└── src/
    ├── main.js            # Bootstrap, Game-Loop
    ├── core/
    │   ├── Engine.js      # Renderer, Szene, Kamera, Resize
    │   ├── GameLoop.js    # Fixed-Timestep Update/Render
    │   ├── Input.js       # Tastatur/Maus/Gamepad-Abstraktion
    │   └── StateMachine.js# Menü → Spiel → Pause → GameOver
    ├── world/
    │   ├── Terrain.js     # Prozedurale Landschaft (Höhenkarte), Meer, Himmel
    │   ├── Sky.js         # Himmel, Sonne, Wolken (Billboards/Shader)
    │   └── Environment.js # Licht, Nebel, Tagesstimmung
    ├── aircraft/
    │   ├── Aircraft.js    # Basis-Klasse (Physik, Modell, HUD-Daten)
    │   ├── FlightModel.js # Auftrieb, Schub, Roll/Nick/Gier, Stall
    │   ├── PlayerJet.js   # Spieler-F-16
    │   └── EnemyJet.js    # KI-Jet mit Verhaltensbaum (patrouillieren,
    │                      #   verfolgen, ausweichen, angreifen)
    ├── combat/
    │   ├── Weapons.js     # Bordkanone + IR-Raketen (Lock-on, Flugbahn)
    │   ├── Projectiles.js # Tracer, Treffer, Schaden
    │   └── Effects.js     # Explosionen, Rauch, Partikel (Pool!)
    ├── ui/
    │   ├── HUD.js         # Fadenkreuz, Speed/Alt, Radar, Lock-On-Anzeige
    │   ├── Menus.js       # Startmenü, Pause, Game Over
    │   └── Radar.js       # Minimap-Radar mit Feindkontakten
    └── audio/
        └── SoundManager.js# Triebwerksloop, Schüsse, Explosionen, Warnsignale
```

**Designprinzipien:** Objekt-Pooling für Projektile/Partikel, keine Allokation im
Game-Loop, klare Trennung Update/Render, konfigurierbare Balance-Werte in einer
`config.js`.

## 4. Gameplay-Design (MVP → spätere Erweiterung)

**MVP (der erste große Build):**
- Freiflug über ~20×20 km Terrain (Berge, Meer, flaches Land)
- Arcade-Flugmodell: Schub (Shift/Ctrl), Pitch/Roll (Pfeile/WASD), Yaw (Q/E),
  Airbrake (S/Space), Nachbrenner mit visuellem Effekt
- 3–5 KI-Feindjets, die patrouillieren und den Spieler angreifen
- Bordkanone mit Trefferspuren + Infrarot-Raketen mit Lock-On (halte Feind im
  Kreis → Ton → feuern)
- HUD: Geschwindigkeit, Höhe, Heading, Radar, Lock-On-Raute, Trefferfeedback
- Kamera: Verfolgerkamera mit Trägheit + optional Cockpit-View (C-Taste)
- Schaden/Hitpoints, Explosion, Respawn, Score
- Startmenü + Pause + Game-Over

**Roadmap danach:**
1. Mehr Jets (F-15, F-22, MiG-29) mit unterschiedlichen Stats
2. Missionsmodus (Eskorte, Bodenziele, Wellen)
3. Sound-Paket & Musik, Cockpit-Detail
4. Mobilsteuerung (Touch), Performance-Tiering
5. (Optional) Multiplayer via WebSockets

## 5. Der Mega-Prompt für den Build (ein Take)

> Baue ein vollständiges, sofort spielbares 3D-Kampfjet-Spiel im Browser nach dem
> obenstehenden Plan. Technologie: Vite + Three.js (ES Modules), JavaScript,
> statisches Deployment. Liefere das komplette Projekt: package.json mit
> `npm run dev` (muss `--host`/`--port` durchreichen), `npm run build`,
> index.html und alle src/-Module gemäß Architektur. Alle Geometrie/Terrain/
> Effekte prozedural oder aus Three.js-Primitiven aufgebaut (keine externen
> 3D-Modelle nötig — Jets als stilisierte, aber erkennbare F-16-Silhouette aus
> Primitiven), damit das Spiel ohne Asset-Downloads läuft. Anforderungen:
> - Flugmodell mit Schub, Nachbrenner, Pitch/Roll/Yaw, sanftem Stall unter
>   Mindestgeschwindigkeit, Geschwindigkeits-abhängiger Wendigkeit
> - Verfolgerkamera mit Lerp-Trägheit + Cockpit-Kamera
> - Mindestens 3 KI-Feindjets mit Zustandsautomaten (Patrouille/Verfolgung/
>   Angriff/Ausweichen), die ebenfalls schießen können
> - Bordkanone (Hitscan-Tracer) und lockbare Raketen mit Sucherlogik,
>   Rauchspur und Explosion
> - HUD: Speed, Alt, Radar mit Kontakten, Lock-On-Anzeige, Health, Score,
>   Warnungen ("LOCK", "STALL")
> - Terrain aus Heightmap (Perlin), Meer, Himmel mit Sonne, bewegte Wolken
> - Objekt-Pooling, stabile 60 FPS auf einem normalen Laptop
> - Menü/Pause/Game-Over, Neustart ohne Reload
> - Sauberer, kommentierter Code, konfigurierbare Balance in config.js
> - README.md mit Steuerung, Build- und Deployment-Anleitung (GitHub Pages)

## 6. Recherche: Skills & Referenz-Projekte (Stand 2026-08-01)

**Lokale Skills, die beim Build genutzt werden:**
- `webapp-building` — verpflichtender Skill für den Webapp-Build (React/Vite-Setup,
  Komponenten-Qualität, Build-/Dev-Server-Konventionen)
- `widget`/`widgetdesign` — nicht nötig; das Spiel ist eine eigenständige Webapp

**Referenz-Projekte auf GitHub (als Vorbilder, kein Code-Klau — Lizenzen beachten):**
- **jakobmaier F-16 Three.js Sim** (jakobmaier.at/posts/flight-simulator-in-javascript)
  — bewährtes Arcade-Flugmodell mit quaternionbasierter Rotation, Kamera-Views,
  Gegner-KI-Ansatz. Beste Referenz für FlightModel.js.
- **dimartarmizi/web-flight-simulator** (Three.js + CesiumJS, F-15) — Referenz für
  professionelles HUD (Pitch Ladder, Heading Tape), Waffensysteme (Vulcan,
  Sidewinder-Lock, Flares), Settings-Persistenz. Achtung: Dual-Lizenz, nur als
  Inspirationsquelle.
- **cedrickchee/vibe-jet** — Referenz für späteren Multiplayer (WebSockets) und
  FOV-gesteuertes Geschwindigkeitsgefühl.
- **phil_crowther Flight Module** (three.js Forum) — einfaches 4-Kräfte-Flugmodell
  (Lift, Drag, Thrust, Gravity) mit verketteten Rotations-Objekten.

**Design-Ambition (groß geplant):**
- HUD im Stil echter Avionik: Pitch-Ladder, Heading-Tape, Speed/Alt-Tapes,
  Lock-On-Raute mit Abschluss-Ton, Warning-Lights (STALL, LOCK, MISSILE)
- Visuelles: Nachbrenner-Flamme (Shader/Sprite), Wingtip-Contrails, Hitzefläche
  am Horizont, Sonne mit Lens-Flare, volumetrische Wolken (Billboards),
  Geschwindigkeits-FOV (zoomt bei Mach), Explosions-Partikel + Rauchsäulen
- Audio (WebAudio, prozedural synthetisierbar): Triebwerks-Loop mit pitch=Speed,
  Afterburner-Boost, Lock-On-Piepen, Kanonenfeuer, Explosionen, Stall-Warner
- Settings-Menü (Grafikqualität, Sensitivität, Sound) mit localStorage-Persistenz

## 7. Git & GitHub-Workflow

- Repo: **https://github.com/MarkWaldeis/fight-jet-3d** (öffentlich, angelegt 2026-08-01 via API, gespeicherte Credentials)
- Branch-Strategie: `main` (deploybar) — jeder Meilenstein = 1 Commit + Push
- Deployment: GitHub Pages aus dem `dist`-Build (GitHub Action)
- Testbarer Link nach erstem Build: `https://markwaldeis.github.io/fight-jet-3d/`
