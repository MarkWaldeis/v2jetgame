# Prompt: Realistisches Kampfsystem (War-Thunder-Stil) + neue Trainingsmission

Du arbeitest am Projekt **„Fight Jet 3D"** (React 19 + Three.js + TypeScript, Vite).
Projektordner: `Fight Jet Game/app` (alle Pfade relativ dazu).

Ändere NUR die unten genannten Bereiche. Lies die betroffenen Dateien zuerst vollständig,
bevor du änderst.

---

## 1. Aktuelle Probleme (verifiziert im Code — bitte genau diese Stellen beheben)

1. **Auto-Aim / Magnetismus:** In `src/game/Game.ts` (updatePlaying, ca. Zeile 784) wird das
   gelockte Ziel als `assist` an `cannons.fire(...)` übergeben. In
   `src/game/combat/Weapons.ts` (CannonSystem.fire, ca. Zeile 164) lenkt dieser `aimAssist`
   die Schussrichtung (`assistDir`) zum Ziel.
2. **Viel zu große Trefferbox:** In `Weapons.ts` (ca. Zeile 200) gilt:
   `hitRadius = baseRadius + assistBonus + along * spread * 2` → bei 800 m sind das ~20–25 m
   Radius. Praktisch jeder Schuss in Zielrichtung trifft.
3. **Hitscan statt Ballistik:** Der Treffer wird im selben Frame wie der Schuss entschieden
   (keine Kugel-Flugzeit, kein Vorhalt nötig).
4. **Unendlich Munition:** Es gibt kein Munitions-/Nachladesystem; nur der RPM-Cooldown
   (`PlayerJet.canFireCannon`, `PlayerJet.firedCannon`).

---

## 2. Ziele (was der Spieler erleben soll)

- Schießen wie in **War Thunder (Arcade)**: Die Kanone hat echte Kugeln mit Flugzeit.
- **Kein automatisches Treffen mehr.** Ich muss mit der Nase VOR das Ziel halten (Vorhalt),
  weil die Kugeln Flugzeit haben.
- Über dem Gegner schwebt ein **Fadenkreuz (Lead-Indicator) an der Vorhalt-Position**:
  Wenn der Gegner quer fliegt, sitzt das Fadenkreuz deutlich VOR dem Flugzeug. Ich bringe
  mein Gun-Crosshair (Nase) auf dieses Fadenkreuz, dann treffe ich.
- Nicht jeder Schuss muss treffen — realistisch: nur wenn die Kugel wirklich durch die
  Zielbox fliegt.
- Gegner fliegen deutlich langsamer, damit das Treffen möglich und übungsfreundlich ist.
- **Begrenzte Munition + Nachladen mit R** (dauert einige Sekunden, kein Dauerfeuer).

---

## 3. Umsetzung

### 3.1 Auto-Aim komplett entfernen
- `src/game/Game.ts` (updatePlaying): Den `assist`-Block (ca. Zeile 784–791) entfernen —
  `cannons.fire(...)` wird ohne Assist-Parameter aufgerufen. Der Lock-On bleibt für Raketen
  erhalten, beeinflusst aber die Kanone nicht mehr.
- `src/game/combat/Weapons.ts` (CannonSystem.fire): Die komplette `aimAssist`-Logik entfernen
  (`assistDir`, die Umlenkung der Schussrichtung, `assistBonus`). Schussrichtung ist immer
  `shooter.forward` + normale Streuung (`cannonSpread`).
- Die Trefferbox auf realistisches Maß reduzieren (siehe 3.2).

### 3.2 Echte Projektil-Ballistik (kein Hitscan mehr)
- Die Tracer werden zu echten Projektilen:
  - Geschwindigkeit: **950 m/s** (neuer Konfig-Wert `CONFIG.player.bulletSpeed = 950`).
  - Jedes Projektil speichert: Position, Velocity, **Ziel-Referenz**, Schaden, `onHit`-Callback,
    Lebensdauer (`CONFIG.player.cannonRange / bulletSpeed` ≈ 0,95 s).
  - Objekt-Pool verwenden (Pool auf ~200 erhöhen, bisher 100 Tracer).
- **Kollisionsprüfung** im `update(dt)` von CannonSystem: Projektil bewegen, dann
  Punkt-Segment-Distanz (Strecke vom alten zum neuen Punkt) gegen das Zielzentrum prüfen:
  - Treffer-Radius: **4 m** für Luftziele (Spieler- und Gegnerjets), 14 m für SAM-Stellungen
    (Bestandswert). KEINEN Bonus mehr.
  - Treffer → `effects.hitSparks(...)`, `onHit(ziel, schaden)` aufrufen, Projektil entfernen.
  - Lebensdauer abgelaufen → Projektil entfernen (kein Treffer).
- Leichter Geschossabfall (Gravity) ist optional — wenn eingebaut, minimal (≈3 m/s²), damit
  der Vorhalt das dominante Element bleibt.
- Mündungsblitze und Tracer-Grafik exakt so lassen wie bisher (nur `TRACER_SPEED` auf die
  Kugelgeschwindigkeit angleichen). `getMuzzles()` der Jets bleibt die Schussquelle.
- Gegner nutzen dasselbe Projektil-System (Ziel = Spieler, Trefferradius 5 m). Gegner
  behalten unbegrenzte Munition.

### 3.3 Lead-Indicator (War-Thunder-Fadenkreuz) im HUD
- **Berechnung** (in `src/game/Game.ts`): Für das „fokussierte Ziel" — Lock-Ziel, sonst das
  nächste lebende Ziel vor der Nase innerhalb von `CONFIG.player.cannonRange`:
  1. Flugzeit schätzen: `t = dist / CONFIG.player.bulletSpeed`
  2. Vorhalt-Punkt: `zielPos + zielGeschwindigkeit * t` (Zielgeschwindigkeit über den
     bestehenden Getter `flight.velocity` in `src/game/aircraft/FlightModel.ts`)
  3. 2–3 Iterationen wiederholen (t aus Distanz zum Vorhalt-Punkt neu berechnen).
- **HudData** erweitern: `leadIndicator: { x: number; y: number; visible: boolean } | null`
  (Bildschirm-%, wie `worldMarkers` in `emitHud` projizieren). Nur sichtbar, wenn das Ziel im
  Sichtfeld ist und < 1200 m entfernt.
- **`src/components/Hud.tsx`**: An dieser Position ein Fadenkreuz rendern (kleiner Kreis mit
  kurzen Strichen oben/unten/links/rechts, gelb/weiß, War-Thunder-Stil). Es schwebt beim
  Querflug sichtbar VOR dem Ziel-Flugzeug.
- Zielen funktioniert dann so: Maus-Reticle so führen, dass das **Gun-Crosshair (Nase)** auf
  dem Lead-Indicator liegt → Treffer. Das Ziel selbst anvisieren → Kugeln fliegen hinterher
  und verfehlen.

### 3.4 Munition + Nachladen (Taste R)
- `src/game/aircraft/PlayerJet.ts`: Neue Felder `ammo`, `maxAmmo`, `reloading`, `reloadTimer`.
  - `maxAmmo = 500` (Konfig `CONFIG.player.cannonAmmo = 500`).
  - `canFireCannon()`: nur wenn `ammo > 0 && !reloading && cooldown <= 0`.
  - `firedCannon()`: dekrementiert `ammo`.
- `src/game/core/Input.ts`: Taste **R** registrieren (ist aktuell unbelegt).
- `src/game/Game.ts` (updatePlaying): Bei R (wasPressed) und nicht reloading und
  `ammo < maxAmmo` → Reload starten: `reloadTimer = CONFIG.player.reloadTime = 3.5` (s).
  Nach Ablauf: `ammo = maxAmmo`. Während des Reloads nicht schießbar. Kein Auto-Reload.
- HUD (`src/components/Hud.tsx`): Munitionsanzeige „AMMO 500" im Waffen-/Score-Panel;
  während des Nachladens „RELOADING…" mit Fortschrittsbalken.
- `src/components/Menus.tsx`: In der CONTROLS-Liste ergänzen:
  `{ key: 'R', label: 'Nachladen' }`.

### 3.5 Gegner fliegen langsamer
- `src/game/config.ts`: `CONFIG.enemy.speedScale` von **0.72 → 0.55** (alle Gegner spürbar
  langsamer) und `CONFIG.enemy.speed` von **135 → 115**.
- Wenn es sich im Test träge anfühlt, darfst du im Rahmen von ±20 % feinjustieren —
  Hauptsache: Gegner sind mit der neuen Ballistik gut treffbar.

### 3.6 Neue Trainingsmission als Welle 1 (vor der bisherigen ersten)
- `CONFIG.mission.waves` in `src/game/config.ts` erweitern — **neuer Eintrag VOR dem
  aktuellen ersten**:
  ```
  { bandits: 3, sams: 0, speedScale: 0.4, enemyMissiles: false, label: 'WELLE 1 · TRAINING — Langsame Banditen' }
  ```
- Wave-Typ um optionale Felder erweitern: `speedScale?: number` (Default 1),
  `enemyMissiles?: boolean` (Default true).
- `src/game/Game.ts` (spawnWave): Wave-Parameter an `EnemyJet` durchreichen:
  - `speedScale`: `flight.speedMult` des Gegners zusätzlich mit diesem Faktor multiplizieren
    (in `EnemyJet.spawn` oder Konstruktor anwenden).
  - `enemyMissiles: false`: Gegner der Trainingswelle feuern **keine Raketen** (nur Kanone).
    Falls die KI-Raketen-Logik noch nicht existiert, das Flag trotzdem als Feld vorsehen.
- Die bisherigen 3 Wellen bleiben inhaltlich unverändert (nur der globale speedScale aus 3.5
  wirkt auf sie). HUD-Wellenanzeige zählt dann automatisch 1/4.

---

## 4. NICHT anfassen (wichtig!)

- `CONFIG.flight.*` und `CONFIG.camera.*` sind als **FROZEN** markiert (Kopf von
  `src/game/config.ts`: „BASELINE FROZEN — passt perfekt") — Fluggefühl und Kamera bleiben
  unverändert.
- `src/game/aircraft/FlightModel.ts` (Physik), Jet-FX-Anker in `JetCatalog.ts`,
  `GlbJetLoader.ts`, `SoundManager.ts` — nur anfassen, wenn es für 3.4 zwingend nötig ist.
- Keine Änderungen an Raketen-Logik (Lock-On, Missile-Verhalten) — nur die Kanone wird
  umgestellt.

## 5. Verifikation (Pflicht)

1. `cd app && npm run build` → muss fehlerfrei durchlaufen (tsc + vite).
2. `npm run dev` und manuell testen:
   - Trainingsmission starten (Welle 1/4): Gegner deutlich langsamer, keine Raketen.
   - Gegner quer fliegen lassen → Lead-Fadenkreuz schwebt vor dem Flugzeug; Nase auf das
     Fadenkreuz bringen → Treffer. Auf das Flugzeug selbst zielen → Kugeln gehen daneben.
   - Munition läuft leer, R startet ~3,5 s Reload mit HUD-Anzeige, danach wieder voll.
   - Welle 2–4 (bisherige 1–3) weiterhin normal spielbar.
3. Gegner-Kanonen treffen nur noch bei echtem Vorhalt — nicht automatisch.

## 6. Stil

- Code-Kommentare auf Deutsch (wie im Bestand).
- Konfig-Werte nach `src/game/config.ts`, Balance nicht hart verdrahten.
- Objekt-Pools für Projektile nutzen (keine Allokation im Game-Loop).
- Bestehende Konventionen und Dateistruktur beibehalten.
