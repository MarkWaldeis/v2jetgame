# ✈️ FIGHT JET 3D — War-Thunder-Gap-Analyse & Baustellen-Report

> **Stand der Analyse:** 05.08.2026 · read-only Analyse des Codes (es wurde nichts geändert)
> **Zweck:** Nachschlagewerk, was noch fehlt, um das Spiel auf War-Thunder-Niveau zu heben.
> **Checklisten:** `- [ ]` = offen, `- [x]` = erledigt (einfach abhaken).
> **Alle Pfade relativ zu:** `Fight Jet Game/app/`

---

## 1. Kurzüberblick: Wo das Spiel heute steht

| Bereich | Status |
|---|---|
| **Flugzeug-Flotte** | 8 Jets (F-16, F-35, F-14, L-39, Elite, Su-25, Su-34, Su-57) mit eigenen GLB-Modellen, NATO/Russland-Faction |
| **Flugmodell** | War-Thunder-inspiriertes Mouse-Aim FBW, Manual-Override, AoA/Sideslip, Energy Bleed, Stall/Trudeln, G-Force, Wind — per-Jet-Physikprofile |
| **Welt** | 42×42-km-Prozeduralwelt (Vulkane, Gerstner-Ozean, Naval Air Station) + GLB-Karte Glacier (~28 km) |
| **Kampf** | Kanone (Tracer/Hitscan), Lenkraketen (Lead-Pursuit), SAM-Stellungen, Lock-On Luft + Boden |
| **HUD** | Triple-Reticle, Radar-TWS, Lock-Raute, Kill-Confirm, Liquid-Glass-Design |
| **Menü/Ökonomie** | Hangar mit Stat-Bars, Aero-Credits, Jet-Kauf, 4 Missionskarten (1 spielbar) |
| **Sound** | Prozedurales WebAudio (Triebwerk, Nachbrenner, Lock-Ton, Kanone, Explosion, Stall) |

**Gesamturteil:** Solides, rundes Single-Player-Arcade-Spiel mit guter Architektur
(config-/kataloggetrieben, erweiterbar). Der WT-Sprung fehlt in 4 Dimensionen:
tote Features (P0), Kerngameplay-Tiefe (P1), Content & Progression (P2), Plattform (P3).

---

## 2. 🔴 P0 — Tote Features & Sofort-Gewinne

> Kleine Änderungen, die sofort spürbar sind. Teilweise ist der Code schon da,
> nur nicht verdrahtet.

### 2.1 Flares sind ein Phantom-Feature
- [ ] **Status:** `flareCount` steht in jedem Jet-Def (F-16: 8, Su-25: 12), `flaresLeft` existiert in PlayerJet — aber **keine Taste, kein Auswurf, keine Gegenmaßnahmen-Mechanik**. (Grep über `src/` findet nur die Stats.)
- [ ] **Was zu tun ist:**
  - Keybind (z. B. `C` doppelt / `X`) in `src/game/core/Input.ts`
  - Flare-Auswurf + Visual (Leuchtpartikel) in `src/game/combat/Effects.ts`
  - Raketen-Sucherlogik: Flares können Lock brechen (in `Missile.update`, `src/game/combat/Weapons.ts`)
  - Zähler im HUD (`src/components/Hud.tsx`)
- [ ] **Code-Stellen:** `JetCatalog.ts` (flareCount), `PlayerJet.ts:15` (flaresLeft), `Weapons.ts` (Missile), `Input.ts`, `Hud.tsx`

### 2.2 Gegner-KI feuert nie Raketen
- [ ] **Status:** `EnemyJet.ts` hat nur Kanonen-Logik. Raketen-Ausweichen ist gegen KI unnötig — das „MISSILE! → Flares → Ausweichen"-Gefühl (Herz von WT) fehlt.
- [ ] **Was zu tun ist:**
  - EnemyJet bekommt Missile-Launch (eigene kleine Rack-Anzahl, z. B. 2–4)
  - Launch-Bedingung: Distanz + vorne im Kegel + Cooldown
  - Raketen der Gegner nutzen dieselbe `Missile`-Klasse (nur Owner anders)
  - `Game.ts` Gegner-Sektion (ca. Zeile 779) erweitern
- [ ] **Code-Stellen:** `src/game/aircraft/EnemyJet.ts`, `src/game/Game.ts:779` (Gegner-Loop), `src/game/combat/Weapons.ts` (Missile-Klasse wiederverwenden)

### 2.3 RWR — Radar-Warnempfänger
- [ ] **Status:** Nur generischer Text „⚠ MISSILE" im HUD. Keine Richtungs-/Bedrohungs-Info.
- [ ] **Was zu tun ist:**
  - HUD-Kompass-Anzeige mit Richtungspfeil zur Bedrohung (Achtung: Rakete vs. Radar-Lock unterscheiden)
  - Piep-Ton mit Richtungs-Charakter in `SoundManager.ts`
  - „RWR"-Symbol im HUD, das bei Rakete/SAM-Lock aufleuchtet
- [ ] **Code-Stellen:** `src/game/Game.ts` (emitHud, warning), `src/components/Hud.tsx`, `src/game/audio/SoundManager.ts`

### 2.4 graphicsQuality-Setting bewirkt nichts
- [ ] **Status:** Wird im Menü gespeichert (`Menus.tsx:383`), aber nie an den Renderer weitergegeben.
- [ ] **Was zu tun ist:** Pixel-Ratio / Schatten / Wolken-Dichte / Fog an die Stufe koppeln (z. B. in `Engine.ts` oder `Sky.ts`).
- [ ] **Code-Stellen:** `src/lib/gameSettings.ts`, `src/components/Menus.tsx:383`, `src/game/core/Engine.ts`

### 2.5 HUD zeigt immer „AIM-9 × N"
- [ ] **Status:** Waffenname ist im Score-Panel hardcoded — auch F-35 (AMRAAM) und Su-57 (R-77) zeigen „AIM-9".
- [ ] **Was zu tun ist:** Waffenname aus `JetDef` ableiten (z. B. `special.label` oder neues Feld `weaponName`) und im HUD dynamisch anzeigen.
- [ ] **Code-Stellen:** `src/components/Hud.tsx` (Score-Panel, ca. Zeile 305), `src/game/aircraft/JetCatalog.ts` (JetDef)

### 2.6 Missionskarte 01 verspricht Inhalte, die es nicht gibt
- [ ] **Status:** „OPERATION DESERT STORM" beschreibt Bodentruppen + Hauptquartier — spielbar sind nur die 3 Standard-Wellen (Luftziele + SAMs).
- [ ] **Was zu tun ist:** Entweder Missionstext an die echten 3 Wellen anpassen oder (besser) echte Bodentruppen einbauen (siehe 3.5).
- [ ] **Code-Stellen:** `src/components/Menus.tsx:1090`

### 2.7 legacyJetIds() ist leer (toter Code)
- [ ] **Status:** Legacy-Pool leer (Assets unter `archived-aircraft/`), `pickBanditJetId` hat damit einen toten Pfad — frühe Wellen spielen nur moderne Jets.
- [ ] **Optionen:** MiG-15/P-51/Spitfire aus `Neue Schlechtere Flugzeuge/` wieder in den Katalog aufnehmen (Dateien liegen im Projekt!) oder Legacy-Pfad aufräumen.
- [ ] **Code-Stellen:** `src/game/aircraft/JetCatalog.ts:498` (legacyJetIds), `src/game/Game.ts:619` (pickBanditJetId)

### 2.8 Aero-Credits: Dev-Modus deaktiviert die Ökonomie
- [ ] **Status:** `DEV_TEST_CREDITS = 9_999_999` (in `gameSettings.ts` als TEMP markiert) — Jet-Kauf ist bedeutungslos.
- [ ] **Was zu tun ist:** Normalen Startwert (z. B. 500–2000) setzen, sobald Missionen Credits ausschütten (siehe 4.2).
- [ ] **Code-Stellen:** `src/lib/gameSettings.ts:24`

---

## 3. 🟠 P1 — Kerngameplay-Tiefe (das „nächste Level")

| # | Feature | Heute | Ziel (WT) | Aufwand |
|---|---|---|---|---|
| 3.1 | Raketen-Typen mit echten Seekern | 1 Verhalten für alle (Kegel + Lead) | IR (Flares), SARH (Chaff), ARH (Fire-and-Forget), Notch-Manöver | ⭐⭐⭐ |
| 3.2 | RWR / Bedrohungs-Lage | Text-Warnung | Richtung + Typ (Lock vs. Missile) | ⭐⭐ |
| 3.3 | Subsystem-Damage-Model | HP + kosmetische Liste | Flügel weg, Triebwerk aus, Ruder blockieren, Feuer | ⭐⭐⭐ |
| 3.4 | Loadout-Wahl | Fixer Raketenmix pro Jet | Raketen/Bomben/Pods frei konfigurieren | ⭐⭐ |
| 3.5 | Bodenkrieg | Nur SAMs | Panzer, Konvois, Schiffe, Flak, Bomber | ⭐⭐ |
| 3.6 | Start & Landung | Spawn in der Luft (350 m) | Piste-Start, Landung, Repair/Reload an Basis | ⭐⭐ |
| 3.7 | KI-Tiefe | State-Machine, nur Kanonen | Wingmen, Formationen, BVR, Missile-Ausweichen | ⭐⭐⭐ |
| 3.8 | Flug-Instrumente | HDG-Pill + G-Wert | **Pitch Ladder + Artificial Horizon (ADI)** | ⭐ |

### 3.1 Raketen-Typen mit echten Seekern
- [ ] IR-Rakete (AIM-9/R-73): Flare-Empfindlich, Kegel-Lock, Wärmesuche
- [ ] SARH-Rakete (AIM-7): Radar-Lock nötig, Chaff kann brechen
- [ ] ARH-Rakete (AIM-120/R-77): Fire-and-Forget nach Mid-Course, Notch/Beam kann brechen
- [ ] Notch-Manöver: Rakete verliert Lock bei seitlicher Flugrichtung (Lock-Lose-Winkel existiert schon, `Weapons.ts:422`)
- [ ] **Code-Stellen:** `src/game/combat/Weapons.ts` (Missile), `src/game/combat/MissileVisuals.ts` (3 Typen existieren visuell!), `src/game/aircraft/JetCatalog.ts` (per-Jet Raketentyp statt nur `missiles`)

### 3.3 Subsystem-Damage-Model
- [ ] Schadenszonen (Flügel links/rechts, Triebwerk, Ruder, Rumpf) statt reiner HP
- [ ] Flügelverlust → Roll-Autorität weg; Triebwerk → Schub weg; Ruder → Pitch/Yaw kaputt
- [ ] Feuer + Rauch am beschädigten Teil (Smoke existiert, `Effects.ts:156`)
- [ ] **Code-Stellen:** `src/game/aircraft/Aircraft.ts` (takeDamage), `src/game/Game.ts` (emitHud-Damage-Panel), `src/game/combat/Effects.ts`

### 3.4 Loadout-Wahl
- [ ] Loadout-Screen im Hangar: Raketenmix, Bomben, Raketen-Pods, Zusatztanks
- [ ] JetDef um `loadouts: Loadout[]` erweitern (`JetCatalog.ts`)
- [ ] Bombs/Rockets als neue Waffenklasse in `Weapons.ts` (Bodenangriff!)
- [ ] **Code-Stellen:** `src/game/aircraft/JetCatalog.ts`, `src/game/combat/Weapons.ts`, `src/components/Menus.tsx`

### 3.5 Bodenkrieg (Mission 01 macht's zur Pflicht)
- [ ] Konvoi/kolonnen aus Fahrzeugen (Instancing nutzen — Terrain macht das schon)
- [ ] Schiffe für die Naval-Karte (Ozean existiert!)
- [ ] Flak-Stellungen als leichte AA (Distanz-basiert statt Raketen)
- [ ] Bomber als große, langsame Luftziele (neue Jet-Kategorie)
- [ ] **Code-Stellen:** `src/game/combat/GroundTarget.ts` (nur SamSite — neue Klassen), `src/game/Game.ts` (spawnWave), `src/game/world/StormbreakTerrain.ts` (Instancing-Vorbild)

### 3.6 Start & Landung
- [ ] Spieler startet auf der Piste (Naval Air Station hat visuell 2,75-km-Runway!)
- [ ] Fahrwerk (GLB-Loader filtert gear/wheel-Teilnamen schon — `GlbJetLoader.ts:60` — aus, wieder aktivieren)
- [ ] Bodenkollision mit Runway vs. Terrain unterscheiden
- [ ] Landing-Zone: Repair/Reload + neue Missionseinsätze
- [ ] **Code-Stellen:** `src/game/Game.ts:268` (placePlayerForMap — „Takeoff-Fix" umbauen), `src/game/world/StormbreakTerrain.ts` (Runway), `src/game/aircraft/GlbJetLoader.ts:60`

### 3.7 KI-Tiefe
- [ ] Gegner schießen Raketen (siehe 2.2) und werfen Flares
- [ ] Wingmen: 1–2 Verbündete, die Befehlen folgen („Attack my target", „Cover me")
- [ ] Formationen (Vic/Line-Abreast) für Patrouille
- [ ] BVR-Verhalten: Raketen schon auf 2–4 km, nicht erst im Kanonenbereich
- [ ] Schwierigkeitsstufen (Anfänger bis Veteran)
- [ ] **Code-Stellen:** `src/game/aircraft/EnemyJet.ts` (State-Machine erweitern), `src/game/Game.ts`

### 3.8 Flug-Instrumente (klein, aber wichtig)
- [ ] Pitch Ladder (horizontale Linien mit 5°/10°-Abstand) ins HUD
- [ ] Artificial Horizon (künstlicher Horizont mit Bank-Anzeige)
- [ ] Daten vorhanden: `flight.bankSigned`, Heading, Pitch sind schon in `FlightModel.ts`
- [ ] **Code-Stellen:** `src/components/Hud.tsx`, `src/game/aircraft/FlightModel.ts` (bankSigned), `src/game/Game.ts` (HudData erweitern)

---

## 4. 🟡 P2 — Content & Progression (Langzeit-Motivation)

### 4.1 Tech-Tree / Forschung
- [ ] Sichtbare Jet-Reihenfolge (Stufen + Voraussetzungen, z. B. F-16 → F-14 → F-35)
- [ ] Forschungskosten + Credit-Einnahmen pro Mission (statt Dev-Boost)
- [ ] „Kaufen"-Flow existiert schon (`purchaseJet` in `gameSettings.ts`)
- [ ] **Code-Stellen:** `src/lib/gameSettings.ts` (ownedJets), `src/components/Menus.tsx` (Hangar)

### 4.2 Missionen 02–04 bauen (UI verspricht sie schon)
- [ ] **CANYON RUN** — Tiefflug, Radarfallen, Nacht. Eigene Wave-Definition + Map.
- [ ] **NIGHT RAID** — Nacht: Sky/Beleuchtung anpassen, Bomber-Verband verteidigen
- [ ] **FINAL ASSAULT** — Alle Gegner gleichzeitig
- [ ] **Technik:** `CONFIG.mission.waves` erweitern oder Missionsprofile in `config.ts`; Missionskarten an echte Inhalte koppeln (`Menus.tsx:1071`)
- [ ] **Code-Stellen:** `src/game/config.ts` (mission), `src/game/Game.ts` (Mission-Logik), `src/components/Menus.tsx:1071`

### 4.3 Weitere Karten
- [ ] MapCatalog (`src/game/world/MapCatalog.ts`) auf mehr Einträge erweitern — GLB-Pipeline (`GlbMapTerrain.ts`) kann das
- [ ] Wüsten-Map (Mission 01 erwähnt Wüstenregion!)
- [ ] **Assets:** `public/maps/` + `Neue Schlechtere Flugzeuge/` Ordner prüfen

### 4.4 Skins / Decals / Callsigns
- [ ] Canvas-Texturen (werden schon genutzt) → eigene Lackierungen
- [ ] Nationale Hoheitszeichen, Tailcodes, persönliche Callsigns
- [ ] **Code-Stellen:** `src/game/aircraft/JetModel.ts` (Canvas-Texturen)

### 4.5 Statistiken & Erfolge
- [ ] Kills, Flugzeit, Raketen-Abwehrquote, Präzision (localStorage)
- [ ] Achievements („10 Kills", „SAM zerstört ohne Schaden", …)
- [ ] **Code-Stellen:** `src/lib/gameSettings.ts` (Persistenz-Vorbild)

---

## 5. 🟢 P3 — Plattform (der echte WT-Vergleich)

> WT ist ein MMO — Multiplayer ist die einzige Sache, die WT zu WT macht.
> Erst P0–P2 abschließen, dann beginnen.

- [ ] **Multiplayer (WebSockets):** 1v1-Dogfight und PvE-Co-op als erster Schritt (GAME_PLAN.md, Abschnitt 4, Punkt 5)
- [ ] **Gamepad-Support:** In Roadmap angekündigt, `Input.ts` hat nichts davon
- [ ] **Mobile/Touch:** Virtual-Sticks + vereinfachtes HUD
- [ ] **Leaderboards** (Score/Raketen-Trefferquote)
- [ ] **Replays / Kill-Cam** (letzte 5 s vor dem Kill)
- [ ] **Spectate-Modus**
- [ ] **VR** (langfristig, nice-to-have)

---

## 6. Empfohlene Reihenfolge (Roadmap)

| Phase | Inhalt | Geschätzter Effekt |
|---|---|---|
| **Phase 1 (Sofort)** | P0 komplett: Flares, KI-Raketen, RWR, HUD-Fixes, Missionstext, Credits normalisieren | Kampfgefühl transformiert — „MISSILE! → Flares → Ausweichen" |
| **Phase 2 (Kern)** | P1: Pitch Ladder/ADI → Loadouts → Bodentruppen/Schiffe → Start & Landung → Subsystem-Damage → Raketen-Typen | WT-DNA im Singleplayer |
| **Phase 3 (Inhalt)** | P2: Tech-Tree, Missionen 02–04, Skins, mehr Maps, Erfolge | Langzeit-Motivation |
| **Phase 4 (Plattform)** | P3: Gamepad → Multiplayer 1v1 → Co-op → Leaderboards | Richtung echtes „WT im Browser" |

**Faustregel:** Jede Phase einzeln spielbar und testbar halten — nach Phase 1
ist das Spiel objektiv besser, ohne dass etwas „halbfertig" wirkt.

---

## 7. Wichtige Code-Stellen (Schnellreferenz)

| Datei | Relevanz |
|---|---|
| `src/game/aircraft/JetCatalog.ts` | Alle Jets, Stats, FX-Anker — zentrale Erweiterungsdatei |
| `src/game/aircraft/FlightModel.ts` | Flugphysik (AoA, Stall, G, Wind) |
| `src/game/combat/Weapons.ts` | Kanone + Missile-Logik (Seeker, Lead, Lock-Lose) |
| `src/game/combat/MissileVisuals.ts` | 3 Raketen-Visuals (AIM-9/120/R-77) — Typen-System andocken |
| `src/game/combat/GroundTarget.ts` | Einzige Boden-Klasse: SamSite — hier neue Bodenziele |
| `src/game/aircraft/EnemyJet.ts` | KI-State-Machine — hier Raketen/Wingmen |
| `src/game/Game.ts` | Missionen, Lock, HUD-Daten, Gegner-Loop |
| `src/game/config.ts` | Balance + Wellen („BASELINE FROZEN" oben nicht anfassen!) |
| `src/components/Hud.tsx` | HUD — hier Pitch Ladder, RWR, Waffenname |
| `src/components/Menus.tsx` | Hangar, Maps, Missionen, Settings |
| `src/lib/gameSettings.ts` | Credits/Ökonomie, Persistenz, DEV-Test-Wert |
| `src/game/world/MapCatalog.ts` | Karten-Katalog (2 Einträge) |
| `src/game/core/Input.ts` | Tasten — hier Flare-/Gamepad-Keybinds |

---

## 8. Fortschritts-Übersicht

**P0 Sofort-Gewinne:** 0 / 8 abgehakt
**P1 Kerngameplay:** 0 / 8 abgehakt
**P2 Content & Progression:** 0 / 5 abgehakt
**P3 Plattform:** 0 / 6 abgehakt

> Einfach `[ ]` → `[x]` setzen, wenn ein Punkt umgesetzt ist.
> Diesen Report bei größeren Meilensteinen aktualisieren.
