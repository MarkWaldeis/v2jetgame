# V2 Jet Game – Analyse- und Reifebericht für eine umsetzende KI

Stand der Analyse: 09.08.2026  
Projektwurzel: `C:\Users\Mark Waldeis\Desktop\v2jetgame`  
Primäre App: `Fight Jet Game/app` (React 19, TypeScript, Vite, Three.js)

## 1. Auftrag und Arbeitsregel für die nächste KI

Dieses Dokument beschreibt den tatsächlich vorliegenden Projektstand und gibt eine Reihenfolge vor, mit der das Spiel zuverlässig zu einer uploadfähigen, erwachsenen Singleplayer-Flight-Combat-Demo weiterentwickelt werden kann.

Die nächste KI soll **nicht** pauschal die Flugsteuerung umgestalten. Die Datei `Fight Jet Game/BASELINE_CONTROLS_CAMERA.md` erklärt ausdrücklich, dass Steuerung und Kamera als „frozen“ gelten. Vor jeder Änderung an Fluggefühl, Mouse-Aim, Rollverhalten oder Kamera muss sie zuerst die dort festgelegten Sollwerte gegen `app/src/game/config.ts` vergleichen. Verbesserungen sind als kleine, messbare Änderungen mit Regressionstest umzusetzen, nicht als großer Rewrite.

Prioritäten:

1. Release-Blocker und falsche/irreführende Funktionen beheben.
2. Ladezeit, GPU- und Eingabezuverlässigkeit stabilisieren.
3. Erst dann die Kampftiefe und den Content ausbauen.
4. Nach jeder Phase Build, Lint, Browser-Smoke-Test und eine echte Mission testen.

## 2. Kurzurteil

Das Projekt ist **kein Rohprototyp** mehr. Es besitzt eine saubere spielbare Grundschleife und überraschend viele echte Systeme: zwei Karten, acht GLB-Flugzeuge, Flugmodell mit AoA/Stall/Energie/Wind, Mouse-Aim-FBW, Cockpit- und Chase-Kamera, Kanonenballistik, Raketen, Gegner-KI, SAMs, AAA, Flares, Radar, Kampagne, Jet-Hangar, lokale Progression, WebAudio sowie einen umfangreichen Satz manueller Puppeteer-Prüfskripte.

Die Stärken liegen im unmittelbaren Fluggefühl, der visuellen Präsentation und der Breite der Systeme. Für einen öffentlichen Upload ist der Code aber noch nicht in einem verlässlichen Release-Zustand. Die größten Risiken sind nicht fehlende Features, sondern Inkonsistenzen: angekündigte Settings ohne Wirkung, teilweise falsche UI-Bezeichnungen, temporäre Entwicklungseinstellungen im Produkt, unkontrolliertes Vorladen großer Assets, unklare Dokumentation sowie ein derzeit rot laufender Linter.

Empfohlenes Ziel für Version 1.0: **„Singleplayer Jet Combat Campaign“**, nicht „War Thunder im Browser“. Die Kampagne soll fünf klar unterscheidbare, faire PvE-Einsätze mit nachvollziehbarer Ökonomie, gut lesbaren Bedrohungen und stabilem Start auf Desktop-Browsern liefern. Multiplayer, Mobile und ein realistischer Simulationsanspruch gehören ausdrücklich in spätere Releases.

## 3. Bestandsaufnahme der Architektur

| Bereich | Ist-Zustand | Bewertung |
|---|---|---|
| Laufzeit | React rendert Menüs/HUD; Three.js rendert die 3D-Welt in einem separaten Canvas. | Gute, verständliche Aufteilung. |
| Einstieg | `App.tsx` erzeugt eine zentrale `Game`-Instanz; der Status wechselt zwischen Menü, Laden und Spiel. | Sinnvoll, aber `Game.ts` ist mit 1.738 Zeilen zu groß. |
| Welt | Prozedurales Stormbreak-Archipel (42 km) plus GLB-Karte Glacier. | Starkes Fundament; Glacier-Höhenraster ist kostspielig. |
| Flugzeuge | `JetCatalog.ts` enthält acht moderne Jets samt Stats, Physikprofilen und FX-Ankern. GLB-Loader normalisiert Orientierung/Größe. | Gute Datenbasis, aber Balance und Waffenidentität sind noch überwiegend kosmetisch. |
| Flugmodell | Quaternion-Rotation, verzögerter Velocity-Vektor, AoA, Stall, Energieverlust, Wind, Propeller-Unterstützung. | Für Arcade-Flight-Combat sehr gut angelegt. |
| Kampf | Gepoolte Kanonen-Projektile, Lock-On, visuelle Raketen, SAM, AAA, Gegnerkanonen und Gegner-Raketen. | Solider Kern, aber nur drei Raketen-Profile. |
| Kampagne | Fünf Level × drei Wellen, steigende Anzahl an Bandits/AAA/SAM. | Funktional, aber Level unterscheiden sich noch primär in Zahlen. |
| Persistenz | `localStorage`: Credits, Jets, Kampagnenfortschritt, Audio, HUD, Grafikqualität. | Grundsätzlich brauchbar; die Ökonomie ist bewusst außer Kraft gesetzt. |
| Qualitätssicherung | TypeScript strict, ESLint, viele Puppeteer-Skripte und JSON-Prüfreports. | Gute Absicht, aber nicht als reproduzierbare CI-Test-Suite integriert. |

Wichtige Dateien:

- `app/src/game/Game.ts`: Mission, Actors, Kampfablauf, HUD-Daten, Asset-Cache. Zu groß; später in Mission/Combat/Hud-Adapter zerlegen.
- `app/src/game/aircraft/FlightModel.ts`: zentrale Flugphysik. Nur nach Baseline-Abgleich anfassen.
- `app/src/game/aircraft/JetCatalog.ts`: Flugzeuge, Stats, Hardpoints, Waffenmarketing.
- `app/src/game/combat/Weapons.ts`: Kanonenpool und Raketenlogik.
- `app/src/game/campaign/CampaignCatalog.ts`: Kampagneninhalt und Belohnungen.
- `app/src/components/Menus.tsx` / `Hud.tsx`: UI; mehrere Daten sind derzeit hart codiert.
- `app/src/lib/gameSettings.ts`: Persistenz und aktuell deaktivierte Ökonomie.

## 4. Was nachweislich funktioniert

Die lokale statische TypeScript-Prüfung über den Compiler-API-Lauf ergab **0 Diagnosen** für 94 Quelldateien. Das bedeutet: Bei korrekt aufgelösten Vite-Typen ist der aktuelle TypeScript-Quellstand konsistent.

Vorliegende Prüfberichte zeigen außerdem, dass alle acht aktuellen Katalogjets mindestens einmal als GLB geladen wurden (`app/hangar-test-report.json`): F-16, F-35, F-14, L-39, Elite-Jäger, Su-25, Su-34 und Su-57. Die Berichte dokumentieren gültige Mündungsanker und ein sichtbares GLB pro Jet. Das ist eine gute Basis, ersetzt aber keinen aktuellen End-to-End-Test auf einem frischen Produktionsbuild.

Im Code bereits umgesetzt, daher nicht erneut als „fehlendes Feature“ planen:

- Flares auf `X` oder `Z`, inklusive Flare-Visual, Cooldown und Decoy-Chance (`Game.ts`, `PlayerJet.ts`, `Effects.ts`).
- Gegner-Raketen; pro Welle erhält maximal ein Gegner begrenzte Raketen (`EnemyJet.ts`, `Game.ts`).
- SAM-Raketen und AAA-Fahrzeuge.
- Radar-Kontakte für Bandits, SAM, AAA und eingehende Raketen.
- Kampagnen-Level 1–5 und lokale Freischaltung.
- Kanonenmunition und manuelles Nachladen mit `R`.
- GLB-Normalisierung, Visual-Caches, Raketenmodelle, Hardpoint-Montage.

Ältere Reports im Repository behaupten teilweise noch, Flares, Gegner-Raketen oder mehrere Kampagnenmissionen fehlten. Diese Aussagen sind überholt. Neue Arbeit darf nicht blind daraus abgeleitet werden.

## 5. Gefundene Fehler und Release-Blocker

### P0-1: Die eingefrorene Steuerungs-/Kamera-Baseline wird im Code verletzt

**Status: bestätigt.** `Fight Jet Game/BASELINE_CONTROLS_CAMERA.md` nennt sich kanonische, „PERFEKT“ getestete Referenz. `app/src/game/config.ts` weicht aber bei vielen Flugwerten davon ab: z. B. `minSpeed`, Reise- und Höchstgeschwindigkeit, Beschleunigung, Ruderwerte, FBW-Werte und `velocityAlignRate`. Besonders kritisch: Die Baseline fordert `bankTurnRate: 0`, der aktive Code nutzt `bankTurnRate: 0.55` und `coordTurnYaw: 0.42`. Das verändert genau das ausdrücklich gewünschte Verhalten „A/D = reines Rollen“.

**Auswirkung:** Ein späteres Fixing wird unvorhersehbar; die Dokumentation verspricht ein anderes Handling als die aktive Version. Das ist ein Release-Risiko, weil Fluggefühl das wichtigste Merkmal des Spiels ist.

**Auftrag:**

1. Eine bewusste Produktentscheidung treffen: Baseline wiederherstellen oder Dokumentation mit einer neu abgenommenen Baseline ersetzen.
2. Bis zu dieser Entscheidung `bankTurnRate` auf 0 und `coordTurnYaw` auf 0 setzen, wenn der Nutzer das frühere „reine Rollen“ wiedererkennen soll.
3. Einen automatisierten Flight-Regression-Test erzeugen: definierte Eingabesequenz (A/D ohne Pitch, Mouse-Aim, Stall, Free-Look) simulieren und Lage, Geschwindigkeit, Heading und Kameradistanz gegen tolerierte Sollbereiche prüfen.
4. Erst nach einer manuellen Abnahme die Referenzdatei und `config.baseline.json` gemeinsam aktualisieren.

### P0-2: Die Grafikqualität im Menü hat keine Wirkung

**Status: bestätigt.** `graphicsQuality` wird in `Menus.tsx` gespeichert, aber der Renderer erhält den Wert nicht. `Engine.ts` setzt Pixelratio, Antialiasing und Schatten fest; Wolken, Sichtweite und Terraindetails lesen die Einstellung nicht.

**Auswirkung:** Die UI verspricht eine Funktion, die nicht existiert. Auf schwachen Laptops fehlt ein Ausweg bei schlechter Framerate.

**Auftrag:**

1. `Game.applySettings(settings)` ergänzen und beim Start sowie nach jeder Settings-Änderung aufrufen.
2. Drei reale Profile definieren:
   - Low: Pixelratio max. 1, reduzierte Wolken/Partikel, geringere Sichtweite, kein MSAA.
   - Medium: Pixelratio max. 1.5, normale Partikel, moderate Sichtweite.
   - High: bisherige Qualität, Pixelratio max. 2.
3. Qualität muss ohne Seitenreload umschalten oder als „wirksam beim nächsten Einsatz“ klar kommuniziert werden.
4. Im HUD optional FPS und aktive Qualität nur im Debug-Modus anzeigen.

### P0-3: Die Waffenanzeige lügt bei fast allen Jets

**Status: bestätigt.** `Hud.tsx` zeigt in der unteren rechten Box immer `AIM-9 × N`. F-35 und F-14 werden jedoch als AMRAAM/Phoenix, russische Jets als R-77 vermarktet.

**Auswirkung:** Sichtbarer Vertrauensverlust und eine falsche Bedieninformation.

**Auftrag:** `HudData` um `weaponLabel` erweitern. In `JetDef` ein echtes `missile`-Objekt statt nur Textmarketing ergänzen (`id`, `label`, `seekerType`, `tune`). Den Label-Wert aus der aktiven Loadout-Definition an das HUD reichen. Akzeptanztest: Auswahl von F-16, F-35, F-14, Su-34 und Su-57 zeigt jeweils die korrekte Bezeichnung.

### P0-4: Die Ökonomie ist im Produktmodus vollständig deaktiviert

**Status: bestätigt.** `gameSettings.ts` setzt `DEV_TEST_CREDITS = 9_999_999`. Beim Laden werden Credits außerdem mindestens auf diesen Wert erhöht. Damit sind Preise, Kaufdialog und Kampagnenbelohnungen wirkungslos.

**Auswirkung:** Progression ist nur optisch vorhanden; jeder Jet ist sofort kaufbar. Das passt nicht zu den verschlossenen Kampagnenstufen und zerstört die Motivation der ersten Spielstunden.

**Auftrag:**

1. Development-Boost ausschließlich über eine lokale, nicht versionierte Debug-Flag aktivieren (z. B. URL-Parameter oder `import.meta.env.DEV`).
2. Veröffentlichungswert festlegen, z. B. 1.200 Credits; F-16 und Su-25 bleiben Startjets.
3. Alte `localStorage`-Daten migrieren: vorhandene 9.999.999 Credits nur nach ausdrücklicher Nutzerentscheidung zurücksetzen oder als „Teststand erkannt“ behandeln.
4. Belohnungen so balancieren, dass nach Level 1 mindestens ein kleiner Jet, nach Level 2/3 ein Mittelklassejet und nach Level 4/5 ein Topjet erreichbar ist.
5. Wiederholbare Belohnungen bewusst gestalten: Aktuell zahlt `completeCampaignLevel()` die volle Belohnung auch bei Wiederholung. Entweder klar als Farming erlauben oder Erstabschluss-Bonus plus kleiner Wiederholungsbonus einführen.

### P0-5: Der Start lädt unnötig große Datenmengen und kann schwache Geräte überfordern

**Status: bestätigt.** Der Konstruktor von `Game.ts` ruft für **alle** Jets `loadJetTemplate()` auf. Die GLB-Assets im öffentlichen Ordner umfassen bereits etwa 180 MB nur für die acht Flugzeuge; Karten und Waffenpacks bringen den Gesamtbestand auf rund **238 MB**. Einzelne Modelle sind sehr groß: F-14 und Su-34 jeweils ca. 43,65 MB, L-39 ca. 29,39 MB.

Der vorhandene Hangar-Report zeigt auch lange Einzel-Ladezeiten (bis etwa 23 Sekunden für einen Jet im Testlauf). Gleichzeitiges Vorladen erzeugt Bandbreiten- und RAM-Druck statt einer schnellen, ersten spielbaren Szene.

**Auftrag:**

1. Beim ersten Seitenaufruf ausschließlich Standardjet, ausgewählte Karte und benötigtes Raketenmodell laden.
2. Gegner dürfen zunächst ein prozedurales Fallback-Visual erhalten; deren GLBs bei Bedarf nachladen. Alternativ nur die möglichen Gegnerjets der konkreten Mission vorladen.
3. In der Hangaransicht nur das aktiv betrachtete Jetmodell laden; Thumbnails müssen leichtgewichtig sein.
4. GLB-Dateien mit Draco/Meshopt und KTX2/Basis-Texturen komprimieren, ohne die Silhouette zu zerstören.
5. Ladebildschirm mit echten Byte-/Asset-Fortschritten statt fester Prozentstufen versehen.
6. Zielwerte definieren: First interactive menu < 5 s auf normalem Desktop; Missionsstart mit bereits ausgewähltem Jet < 8 s; keine fünf oder mehr parallelen großen GLB-Requests.

### P0-6: Der Linter schlägt fehl

**Status: bestätigt.** Ein ESLint-Lauf über `src` meldet 19 Fehler. Darunter sind zwar mehrere vermutlich ungenutzte shadcn-artige UI-Komponenten, aber der Release-Check darf nicht rot sein.

Relevante Projektfehler:

- `JetThumb.tsx:24`: synchrones `setState` in einem Effect; kann unnötige Renderkaskaden erzeugen.
- `FlightModel.ts:451`, `Game.ts:1116`, `Game.ts:1253`, `Terrain.ts:6`: `prefer-const`.
- `GlbJetLoader.ts`: mehrere unregelmäßige Unicode-Leerzeichen.
- `JetModel.ts:47` und `:60`: Ausdruck ohne Wirkung.

Zusätzlich betreffen mehrere Fehler nicht verwendete UI-Bausteine (`components/ui/*`), einschließlich `Math.random()` während des Renderns in `sidebar.tsx`.

**Auftrag:** Unbenutzte UI-Komponenten entfernen oder sauber isolieren, die genannten Quellfehler beheben und `npm run lint` als zwingenden CI-Schritt vor dem Deployment einführen. Ziel: 0 Errors, akzeptierte Warnings nur mit Begründung.

### P0-7: Dokumentation und Release-Metadaten sind noch Template-/Widerspruchsreste

**Status: bestätigt.** `app/package.json` heißt `my-app`, hat Version `0.0.0`; `app/README.md` ist das unveränderte Vite-Template. Das Haupt-README und der alte Masterplan enthalten zudem verschiedene, teils veraltete URLs, Architektur- und Stackangaben.

**Auftrag:**

- Paketname auf einen echten technischen Namen, z. B. `fight-jet-3d`, und Version auf `1.0.0-rc.1` setzen.
- `app/README.md` durch eine echte technische Anleitung ersetzen.
- Ein einziges kanonisches README mit aktueller Live-URL, Steuerung, Browseranforderungen, Credits/Lizenzen der Modelle und bekannten Einschränkungen pflegen.
- Die Steuerungstabelle um `R` (Reload), `X/Z` (Flares) und die tatsächliche Taste für Cockpit/Free-Look korrigieren.

## 6. Weitere bestätigte oder sehr wahrscheinliche Qualitätsprobleme

### 6.1 Raketen sind visuell unterschiedlich, spielmechanisch aber fast gleich

`MissileVisuals.ts` wählt AIM-9, AIM-120 und R-77 nur für das Modell. In `Weapons.ts` gibt es Tunings nach `player`, `enemy` und `sam`, nicht nach tatsächlichem Raketentyp. F-35, F-14 und Su-57 fühlen sich daher trotz anderer Namen/Pakete im Kern gleich an; nur Lock-Reichweite, Lockzeit und Winkel des Jets unterscheiden sich.

**Reife-Schritt:** Ein datengetriebenes `MissileDefinition`-System bauen. Mindestens:

- IR: engerer Lock, Flare-empfindlich, kurze Reichweite.
- ARH: große Reichweite, aktive Phase, geringere Flare-Wirkung.
- SARH/halbaktiv optional später: Radar-Lock muss erhalten bleiben.
- Bodenrakete: eigener Sucher, RWR-Warnung, hohe Bedrohung, aber klar konterbar.

Das System darf nicht mit realen Militärdaten werben; es soll konsistent arcade-tauglich und verständlich sein.

### 6.2 Das Schadenpanel simuliert Subsysteme nur optisch

`Game.ts` leitet ENGINE, FLIGHT CTRL, RADAR, WEAPONS und HYDRAULICS ausschließlich aus dem globalen Rumpf-HP-Prozentsatz ab. Treffer an einem Teil haben keine andere Wirkung als Treffer an jedem anderen Teil.

**Folge:** Das HUD suggeriert Tiefe, die das Spiel nicht besitzt.

**Empfehlung:** Kurzfristig den Text ehrlicher als „Airframe condition“ gestalten. Mittelfristig Trefferzonen einführen: Engine reduziert Schub/erzeugt Rauch; Wing reduziert Rollautorität; Controls begrenzen Pitch/Yaw; Radar verlängert Lockzeit; Weapons blockieren Raketen. Die erste Version muss simpel und verständlich sein, nicht hochrealistisch.

### 6.3 Flares sind nur bei Elite-Jäger und Su-57 verfügbar

Kampagnenlevel ab Iron Curtain enthalten feindliche Raketen und SAMs, aber der Standard-F-16 und die meisten kaufbaren modernen Jets besitzen laut `JetCatalog.ts` null Flares. Das kann faire Verteidigung unnötig an seltene Topjets koppeln. Außerdem dokumentiert das README die Gegenmaßnahme nicht vollständig.

**Empfehlung:** Allen modernen Jets eine kleine Grundmenge (z. B. 8–12 Salven) geben; Topjets erhalten mehr Kapazität oder bessere Sensoren, nicht den exklusiven Zugang zur grundlegenden Überlebensmechanik. Alternative: Jede Mission ohne Flares muss zuverlässig durch Ausweichen/Terrainmaskierung überlebbar sein und dies klar lehren.

### 6.4 Landefahrwerk / externe Bewaffnung müssen visuell auf allen Modellen geprüft werden

Der Loader versucht Fahrwerk und mitgelieferte Waffen ausschließlich über Knotennamen zu verstecken. Das ist für Fremd-GLBs nicht robust. Ein vorhandener Screenshot zeigt einen F-16 im Luftstart mit sichtbar wirkendem Fahrwerk bzw. externer Modellbewaffnung; der Screenshot kann älter sein, ist aber ein ernstes QA-Signal.

**Auftrag:** Mit einem aktuellen Production-Build für jeden Jet Screenshots von vorne, Seite, Chase und Cockpit erstellen. Nicht nur Namen filtern: problematische Meshes pro Modell über eine Metadatenliste, Tags oder getrennte Modellvarianten behandeln. Langfristig ein echtes Fahrwerks-System bauen oder im Airborne-Modus garantiert eine gear-up-Variante verwenden.

### 6.5 Kampagne ist zahlenbasiert, nicht missionsbasiert

Die fünf Level unterscheiden sich in `CampaignCatalog.ts` hauptsächlich durch Bandit-, AAA- und SAM-Anzahlen sowie Geschwindigkeitsfaktoren. Das funktioniert als Challenge-Leiter, erzeugt aber wenig Erinnerung oder Dramaturgie.

**Empfohlenes Missionsformat:** Jede Mission bekommt Zieltypen, Start-/End-Text, eine klare Primäraufgabe, optionalen Bonus und einen eigenen Gegner-Mix. Beispiele: Eskorte, Abfangen eines Bombers, SEAD mit zeitkritischem Radar, Tiefflug durch Canyon, Konvoi verteidigen. Erst neue Zieltypen und Mission-Definitionen schaffen, dann Karten vermehren.

### 6.6 `Game.ts` ist ein Wartbarkeitsrisiko

Die Klasse verwaltet Engine, Karte, Asset-Loading, Player, Gegner, SAMs, AAA, Raketen, Missionen, HUD-Projektion, Audio und Settings-nahe Funktionen zugleich. Jede neue Feature-Änderung kann versehentlich andere Systeme brechen.

**Sichere Zielstruktur (inkrementell, ohne Big Bang):**

```text
game/
  Game.ts                 # Boot, Status, Zusammensetzen
  systems/
    MissionSystem.ts      # Spawn, Ziele, Fortschritt, Belohnung
    CombatSystem.ts       # Kanone, Raketen, Treffer, Teams
    TargetingSystem.ts    # Lock, RWR, Radar, Marker
    AssetManager.ts       # Lazy loading, Progress, Cache/Dispose
    HudAdapter.ts         # kompakte reine HudData-Erzeugung
```

Vor dem Extrahieren mindestens einen Smoke-Test für Start, Pause, Sieg und Niederlage anlegen.

### 6.7 Der Deployment-Workflow ist doppelt und unnötig riskant

Der GitHub-Workflow publiziert einmal über `peaceiris/actions-gh-pages` in einen Branch und lädt danach zusätzlich ein offizielles Pages-Artefakt hoch, das mit `actions/deploy-pages` ausgeliefert wird. Zwei Strategien in einem Workflow machen Fehlerdiagnose unnötig schwer.

**Empfehlung:** Eine Strategie wählen. Für GitHub Pages ist der offizielle Artifact/Deploy-Pfad ausreichend. Branch-Publishing entfernen, oder klar begründen, wofür der `gh-pages`-Branch noch benötigt wird. Vor dem nächsten Upload prüfen, welche Pages-Quelle im Repository aktiviert ist.

## 7. Teststrategie für eine uploadfähige Version

Die vorhandenen Puppeteer-Dateien sind wertvoll, aber sie liegen als Einzeldateien neben der App und sind nicht über die `package.json` standardisiert erreichbar. Teilweise greifen sie außerdem auf private Laufzeitfelder via `window.__game` zu; das ist als Diagnosetool okay, aber kein stabiler Vertrag.

### Pflicht-Gates für Pull Requests und Deployment

1. `npm ci`
2. `npm run lint` → 0 Fehler.
3. `npm run typecheck` (neu; nur `tsc -b`).
4. `npm run build`.
5. `npm run test:smoke` (neu; startet Preview auf zufälligem Port, öffnet Puppeteer, prüft Menü → Mission → Pause → Rückkehr).
6. `npm run test:assets` (neu; testet alle Jet-/Map-Ladevorgänge und erfasst Ladezeiten).

### Konkrete Browser-Szenarien

| Szenario | Erwartung |
|---|---|
| Erststart mit leerem Storage | Menü erscheint, Standardjet vorhanden, keine Konsolenfehler. |
| F-16 starten | Ladebildschirm endet, Canvas sichtbar, HUD korrekt, Steuerung arbeitet. |
| Low/Medium/High wechseln | Pixelratio/Partikel/Sichtweite ändern sich messbar. |
| Alle Jets auswählen | Korrektes Modell, richtige Größe, keine Doppelraketen/kein sichtbares Fahrwerk im Luftstart. |
| Gegnerwelle | Gegner bewegen sich, können treffen, aber nicht unkontrolliert spawnen. |
| Raketenbedrohung | Warnung, Radar, Flare, Decoy und Ausweichen funktionieren. |
| Mission victory | Level wird genau einmal freigeschaltet; Credits haben den erwarteten Wert. |
| Mission gameover | Kein festhängender Canvas, Menü ist bedienbar, keine doppelte Belohnung. |
| Page reload | Besitz, Credits, Audio, HUD und Kampagnenfortschritt bleiben konsistent. |
| 1366×768 sowie 1920×1080 | HUD überlappt nicht unlesbar; Menü ist vollständig erreichbar. |

### Performance-Messung

Auf mindestens einem integrierten-GPU-Laptop und einem normalen Desktop testen. Im Debug-Build Metriken protokollieren: FPS (Median/1%-Low), Renderauflösung, Anzahl Meshes/Drawcalls, JS-Heap sofern verfügbar, Anzahl gleichzeitig geladener GLBs und Zeit bis kontrollierbar. Keine Leistungsbehauptung wie „stabile 60 FPS“ veröffentlichen, bevor sie gemessen wurde.

## 8. Empfohlene Umsetzungs-Roadmap

### Phase A – Release-Sanierung (zuerst, klein und überprüfbar)

1. Baseline-Konflikt entscheiden und dokumentieren.
2. Dev-Credits entfernen; lokale Migration ergänzen.
3. Dynamisches Waffenlabel implementieren.
4. Grafikprofile wirklich anbinden.
5. Lint auf 0 bringen.
6. Paketname, Version, README und Steuerung bereinigen.
7. Deployment auf eine GitHub-Pages-Strategie reduzieren.

**Definition of Done:** frischer Browser-Start, Standardmission, Sieg/Niederlage und Settings funktionieren ohne Fehler; alle UI-Versprechen stimmen mit dem Code überein.

### Phase B – Stabilität und Ladezeit

1. AssetManager/Lazy Loading einführen.
2. Große GLBs komprimieren und Request-Reihenfolge messen.
3. Aktuellen visuellen Jet-Matrix-Test erzeugen.
4. Kontextverlust, Map-Fallback und abgebrochene Ladevorgänge robust behandeln.
5. `Game.ts` zunächst nur an klaren Grenzen extrahieren, nicht komplett neu schreiben.

**Definition of Done:** Auswahl eines Jets startet reproduzierbar, keine großen parallelen Vorabdownloads, akzeptable Ladezeiten auf Zielhardware.

### Phase C – Kampfreife

1. Datengetriebene Raketenklassen und korrekte UI/RWR.
2. Grundflares für alle passenden modernen Jets.
3. Ehrliches Damage-Modell oder echte Subsystemschäden.
4. Gegnerverhalten ausbauen: unterschiedliche Rollen, Formation, klare BVR- und Dogfight-Phasen, keine Zufalls-Spikes.
5. Schwierigkeit nicht nur über Anzahl und Geschwindigkeit skalieren, sondern über Trefferwahrscheinlichkeit, Reaktionszeit und verfügbare Gegenmaßnahmen.

**Definition of Done:** Jede Niederlage wirkt verständlich und vermeidbar; Jetwahl verändert mehr als Modell und Zahlen.

### Phase D – Kampagnenreife

1. Jede der fünf Missionen bekommt ein individuelles Ziel und Debriefing.
2. Zwei bis drei neue Bodenzieltypen ergänzen (Konvoi, Radar, Schiff oder Depot) statt sofort viele neue Karten.
3. Rewards, Preise und Unlocks spielen lassen und aus Telemetrie/Tests nachjustieren.
4. Optional: Start/Landung als separater Modus; nicht vorab an alle Missionen koppeln.

**Definition of Done:** Der Spieler hat einen nachvollziehbaren Grund, Level und Jets mehrfach zu spielen.

## 9. Dinge, die vorerst nicht priorisiert werden sollten

- Multiplayer: benötigt Serverautorität, Netzcode, Anti-Cheat/Desync-Konzept und ist ein separates Produktprojekt.
- Mobile/Touch: erst nach sauberem Desktop-Input und Performance-Tiering.
- VR: erst nach stabiler Framerate und Cockpit-UX.
- Vollsimulation realer Flugzeuge oder Waffen: passt nicht zur aktuellen Arcade-Auslegung und erhöht Komplexität stark.
- Viele zusätzliche Modelle/Karten: erst nach Asset-Budget und Lazy Loading, sonst verschlechtert jedes Asset die Startqualität.

## 10. Abschluss-Checkliste vor dem öffentlichen Upload

- [ ] TypeScript, ESLint und Production-Build sind grün.
- [ ] Kein Dev-Credit-Boost und keine Template-Metadaten mehr im Release.
- [ ] Jede sichtbare Einstellung bewirkt eine echte Veränderung.
- [ ] Jede sichtbare Waffen-/Fahrzeugbeschreibung stimmt mit der Funktion überein.
- [ ] F-16-Standardlauf und mindestens ein schwerer Kampagnenlauf sind auf frischem Storage getestet.
- [ ] Alle acht Jetmodelle sind aus relevanten Kamerawinkeln geprüft.
- [ ] Ladezeiten, Fehlerfälle und Map-Fallback sind getestet.
- [ ] Das README enthält exakte Steuerung, Mindestbrowser, bekannte Einschränkungen und Asset-Credits/Lizenzen.
- [ ] Es gibt nur einen klaren Deploymentweg zu GitHub Pages.

Wenn diese Liste erfüllt ist, wirkt das Projekt nicht nur umfangreich, sondern auch bewusst gepflegt. Danach ist die beste Investition nicht eine weitere ungeprüfte Funktion, sondern eine kleine, klar differenzierte Kampagnenmission pro Update.
