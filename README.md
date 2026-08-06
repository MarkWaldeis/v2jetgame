# 🛩️ Fight Jet 3D — v2

Browserbasiertes 3D-Kampfjet-Spiel (War-Thunder-inspiriert): F-16 „Viper" im USAF-Look
fliegen, 3-Wellen-Mission mit KI-Bandits und SEAD gegen SAM-Stellungen, Bordkanone +
AIM-9 mit Lock-On, Nachbrenner, Cockpit-Interior und Avionik-HUD.

## ▶️ Direkt spielen

**[https://markwaldeis.github.io/v2jetgame/](https://markwaldeis.github.io/v2jetgame/)**

Einfach im Browser öffnen — kein Download, keine Installation. Läuft auf Desktop-Browsern
mit WebGL (Chrome, Edge, Firefox empfohlen).

---

## Projektstruktur

| Ordner | Inhalt |
|---|---|
| `Fight Jet Game/app` | Haupt-App (Three.js + React + TypeScript + Vite) |
| `Fight Jet Game/archived-aircraft` | Archivierte Flugzeug-Modelle |
| `Neue Schlechtere Flugzeuge` | Referenzmaterial |

Details, Steuerung und Features: [Fight Jet Game/README.md](Fight%20Jet%20Game/README.md)

## Entwicklung

```bash
cd "Fight Jet Game/app"
npm install
npm run dev      # http://localhost:3000
npm run build    # Produktions-Build → app/dist
```

Deployment: `gh-pages`-Branch → GitHub Pages.
