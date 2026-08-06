# Archivierte Flugzeug-Assets

Diese Modelle sind **nicht** im aktiven Spiel-Hangar. Sie liegen hier zur späteren Wiedereingliederung.

## `legacy-props/`

| Datei | Flugzeug | Frühere JetId |
|-------|----------|---------------|
| `p51-mustang.glb` | P-51D Mustang | `p51` |
| `p40.glb` | P-40 Warhawk | `p40` |
| `spitfire.glb` | Supermarine Spitfire | `spitfire` |
| `mig3.glb` | MiG-3 | `mig3` |
| `mig15.glb` | MiG-15bis | `mig15` |

### Wiedereinbau (Kurz)

1. Dateien nach `app/public/models/` kopieren.
2. Einträge in `app/src/game/aircraft/JetCatalog.ts` wieder anlegen (`JetId` + Katalog).
3. Optional: `MissileVisuals.missileIdForJet` für russische Legacy-Jets anpassen.

Die Laufzeit-Infrastruktur (PropellerSystem, piston/propeller-Physik, GlbJetLoader-Orientierung) bleibt im Code erhalten.
