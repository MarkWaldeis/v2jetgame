# Fight Jet 3D auf itch.io hochladen

Du lädst **nicht** das GitHub-Repo hoch. Nur das fertige Web-Paket.

## 1. Diese Datei ist das Spiel

```
release/fight-jet-3d-web.zip
```

Erzeugen (im Repo-Root, einmalig):

```bash
cd "Fight Jet Game/app"
npm install
npm run package:itch
```

Danach liegt das ZIP unter `release/fight-jet-3d-web.zip`.
`index.html` ist **im ZIP-Root** (nicht in einem Unterordner). Das erwartet itch.io.

## 2. Bilder für die itch-Seite

| Datei | Wo einfügen auf itch.io |
|---|---|
| `itch-assets/cover.jpg` | Cover Image |
| `itch-assets/banner.jpg` | Page banner / header (optional) |
| `itch-assets/screenshot-menu.png` | Screenshot: Hauptmenü |
| `itch-assets/screenshot-hangar.png` | Screenshot: Hangar |
| `itch-assets/screenshot-gameplay.png` | Screenshot: Flug / HUD |

Cover-Empfehlung itch.io: ca. 630×500. Unsere Key-Art ist 4:3 und wird von itch skaliert.

## 3. Neue Game-Page — Felder zum Abtippen

Öffne [https://itch.io/game/new](https://itch.io/game/new).

| Feld | Wert |
|---|---|
| **Title** | Fight Jet 3D |
| **Project URL** | `fight-jet-3d` (oder frei, solange frei ist) |
| **Short description / tagline** | Arcade jet combat in the browser. Eight jets, two maps, a short campaign. |
| **Classification** | Games |
| **Kind of project** | **HTML** |
| **Release status** | Released |
| **Genre** | Action |
| **Tags** | 3D, flight, combat, jet, webgl, arcade, singleplayer |
| **Pricing** | Free (Donation optional, wenn du möchtest) |
| **Visibility** | Draft zuerst, dann Public |

### Upload

1. **Upload files** → `release/fight-jet-3d-web.zip`
2. Nach dem Upload bei dieser Datei ankreuzen: **This file will be played in the browser**
3. Embed-Größe: **1280 × 720** (16:9). Fullscreen darf an sein.
4. **SharedArrayBuffer / COOP/COEP**: aus lassen (nicht nötig)
5. Mobile: nicht als Mobile-Game markieren

### Beschreibung (kannst du so einfügen)

```
Fight Jet 3D is a single-player arcade jet combat game in the browser.

Take off in an F-16 or Su-25, earn Aero Credits, unlock more airframes, and fly a short campaign over two maps — a procedural island world and a large glacier terrain.

No download, no account, no multiplayer. Progress stays in your browser.

Desktop with mouse + keyboard. Chrome, Edge, or Firefox with WebGL.
The first load can take a minute (large 3D models). English UI.

Controls
- Mouse: aim (fly-by-wire)
- WASD / QE: pitch, roll, yaw
- Shift / Ctrl / mouse wheel: throttle
- Space: cannon · R reload
- F or M: missile (after lock)
- X / Z: flares
- B: landing gear (air) / brake (ground)
- V: cockpit / chase cam · C or RMB: free-look
- P / Esc: pause

This is my first public game. Arcade fiction — not a military sim.
```

### Community / Content

- **Violence**: Ja, Arcade-Luftkampf (keine Gore-Darstellung nötig)
- **Platform**: Web (HTML5)
- **Input**: Keyboard, Mouse

## 4. Sicherheit (kurz)

Es gibt **keinen Server, keine API-Keys, keine Accounts**. Alles läuft lokal im Browser (`localStorage` für Credits/Hangar). Cheats aus der Entwicklung sind im Release-Build aus.

## 5. Nach dem Upload

1. Page als **Draft** speichern
2. Selbst im Embed spielen: Menü → TO BATTLE → fliegen, Pause, zurück
3. Wenn das Embed startet: **Public** schalten
4. Optional denselben Stand auf GitHub Pages: Push auf `main` deployed automatisch

Live-Spiegel (GitHub Pages): https://markwaldeis.github.io/v2jetgame/
