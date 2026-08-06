import * as THREE from 'three';
import { CONFIG } from './config';
import { Engine } from './core/Engine';
import { GameLoop } from './core/GameLoop';
import { Input } from './core/Input';
import { Terrain, Sea } from './world/StormbreakTerrain';
import { Sky } from './world/Sky';
import { PlayerJet } from './aircraft/PlayerJet';
import { EnemyJet } from './aircraft/EnemyJet';
import { CameraController } from './aircraft/CameraController';
import { CannonSystem, Missile } from './combat/Weapons';
import {
  preloadMissileVisual,
  cloneMissileVisual,
  missileIdForJet,
} from './combat/MissileVisuals';
import { Effects } from './combat/Effects';
import { SamSite, type Damageable } from './combat/GroundTarget';
import { SoundManager } from './audio/SoundManager';
import { loadJetGlb } from './aircraft/GlbJetLoader';
import { getJetDef, jetFxVectors, JET_CATALOG, legacyJetIds, type JetId } from './aircraft/JetCatalog';
import { getMapDef, type MapId } from './world/MapCatalog';
import { GlbMapTerrain, loadGlbMap, type HeightField } from './world/GlbMapTerrain';
import { WindField } from './aircraft/WindAndFlutter';

export type GameState = 'menu' | 'playing' | 'paused' | 'gameover' | 'victory';

/** Bildschirmposition in Prozent (0–100), CSS left/top */
export type ScreenPos = { x: number; y: number; visible: boolean };

// Daten, die das React-HUD jede Frame (gedrosselt) bekommt.
export interface HudData {
  state: GameState;
  speedKnots: number;
  altitudeFt: number;
  headingDeg: number;
  throttle: number;
  afterburner: boolean;
  stalled: boolean;
  gForce: number;
  hp: number;
  maxHp: number;
  score: number;
  missiles: number;
  /** Verbleibende Flares (0 = keine / Jet hat keine) */
  flares: number;
  maxFlares: number;
  /** true kurz nach Flare-Auswurf (HUD-Hinweis) */
  flareActive: boolean;
  enemiesAlive: number;
  lockProgress: number; // 0=kein, 0..1 suchend, 1=lock
  lockedTargetName: string | null;
  lockScreen: { x: number; y: number } | null;
  warning: string | null;
  freeLook: boolean;
  autoTrack: boolean;
  /** War Thunder Dual/Triple-Reticle */
  mouseReticle: ScreenPos;   // Reticle 1: Maus-Zielkreuz
  velocityVector: ScreenPos; // Reticle 2: Velocity Vector
  gunCrosshair: ScreenPos;   // Reticle 3: Nase / Gun
  /** Vorhalt-Fadenkreuz (Lead-Indicator) — Bildschirm-% */
  leadIndicator: ScreenPos | null;
  /** Kanonen-Munition */
  ammo: number;
  maxAmmo: number;
  reloading: boolean;
  /** 0..1 Fortschritt beim Nachladen */
  reloadProgress: number;
  manualOverride: boolean;
  airbrake: boolean;
  /**
   * Radar-Kontakte (lokaler Jet-Raum, -1..1 relativ radarRange):
   * bandit = Luftgegner, sam = Boden, missile = eingehende Lenkwaffe
   */
  radar: {
    x: number;
    y: number;
    kind: 'bandit' | 'sam' | 'missile';
    locked: boolean;
    /** true wenn Rakete den Spieler anvisiert */
    incoming?: boolean;
  }[];
  /** Welt→Bildschirm Marker über Gegnern (HP + Distanz) */
  worldMarkers: {
    x: number; // % Bildschirm
    y: number;
    name: string;
    hp: number;
    maxHp: number;
    distM: number;
    locked: boolean;
    visible: boolean;
  }[];
  /** Strukturierter Schaden für Damage-Panel */
  damage: {
    hullPct: number;
    status: string;
    systems: { name: string; ok: boolean }[];
  };
  // Mission
  waveIndex: number;      // 0-basiert
  waveCount: number;
  waveLabel: string;
  samsLeft: number;
  waveBanner: string | null; // großer Einblendetext (neue Welle)
  selectedJetId: JetId;
  jetName: string;
  selectedMapId: MapId;
  mapName: string;
  /** Kill-Confirm-Popup (Gegner abgeschossen) */
  killPopup: {
    id: number;
    title: string;
    targetName: string;
    points: number;
    kind: 'air' | 'ground';
  } | null;
}

export class Game {
  private engine: Engine;
  private loop: GameLoop;
  private input = new Input();
  /** Prozedurales Standard-Terrain (immer im Graph, ggf. unsichtbar) */
  private proceduralTerrain: Terrain;
  private sea: Sea;
  private sky: Sky;
  /** Aktive Höhenquelle (prozedural oder GLB-Map) */
  private heightField: HeightField;
  private glbMap: GlbMapTerrain | null = null;
  private mapCache = new Map<MapId, GlbMapTerrain>();
  private selectedMapId: MapId = 'islands';
  private player = new PlayerJet();
  private enemies: EnemyJet[] = [];
  private sams: SamSite[] = [];
  private cam = new CameraController();
  private cannons: CannonSystem;
  private effects = new Effects();
  private sound = new SoundManager();
  private missiles: Missile[] = [];
  private state: GameState = 'menu';
  private hudListeners: ((d: HudData) => void)[] = [];
  private hudTimer = 0;
  private time = 0;
  private enemyFireTimers: Map<EnemyJet, number> = new Map();
  // Mission
  private waveIndex = 0;
  private waveDelay = 0;
  private waveBanner = '';
  private waveBannerTimer = 0;
  private enemyCounter = 0;
  private killPopup: HudData['killPopup'] = null;
  private killPopupTimer = 0;
  private killPopupSeq = 0;
  private selectedJetId: JetId = 'f16';
  /** Cache geladener Visuals pro Jet-Id */
  private visualCache = new Map<JetId, THREE.Object3D>();
  /** Laufende Lade-Promises pro Jet-Id (verhindert Doppel-Loads) */
  private visualPromises = new Map<JetId, Promise<THREE.Object3D | null>>();
  /** Globale Wind-/Böen-Simulation */
  private windField = new WindField();
  private _windSample = new THREE.Vector3();

  private aimDir = new THREE.Vector3(0, 0, -1);
  private _ndc = new THREE.Vector3();
  private _proj = new THREE.Vector3();
  /** Geglättetes Lead-Fadenkreuz (Bildschirm-%) — weniger Zucken */
  private leadSmoothX = 50;
  private leadSmoothY = 50;
  private leadSmoothActive = false;
  private onContextMenu = (e: Event) => e.preventDefault();

  constructor(canvas: HTMLCanvasElement) {
    this.engine = new Engine(canvas);
    this.input.setCanvas(canvas);
    canvas.addEventListener('contextmenu', this.onContextMenu);

    const proceduralMap = getMapDef('islands');
    this.proceduralTerrain = new Terrain(proceduralMap.worldSizeM);
    this.heightField = this.proceduralTerrain;
    this.sea = new Sea(this.proceduralTerrain);
    this.sky = new Sky();
    this.sky.rebuildClouds(proceduralMap.worldSizeM);
    this.engine.scene.add(
      this.proceduralTerrain.mesh,
      this.sea.mesh,
      this.sky.group,
      this.effects.group
    );

    this.engine.scene.add(this.player.object);
    this.player.applyLoadout(getJetDef(this.selectedJetId));
    this.player.reset();
    this.placePlayerForMap();

    // Startaufstellung für das Menü (ruhige Szene)
    this.spawnWave(0, true);

    this.cannons = new CannonSystem(this.engine.scene);
    this.loop = new GameLoop(this.update, this.render);
    this.loop.start();

    // Default-Jet im Hangar vorladen + alle Katalog-Jets für die Gegner
    void this.ensureJetVisual(this.selectedJetId);
    for (const j of JET_CATALOG) void this.loadJetTemplate(j.id);
    // 3D-Raketen-Visuals (AIM-9, AIM-120, R-77)
    void preloadMissileVisual('aim9');
    void preloadMissileVisual('aim120');
    void preloadMissileVisual('r77');
  }

  getSelectedJetId() {
    return this.selectedJetId;
  }

  getSelectedMapId() {
    return this.selectedMapId;
  }

  /** Karte wählen (Menü). Lädt GLB bei Bedarf, skaliert auf große Spielwelt. */
  async selectMap(id: MapId) {
    const def = getMapDef(id);
    if (id === this.selectedMapId && (id === 'islands' || this.glbMap)) {
      this.emitHud();
      return;
    }

    if (def.kind === 'procedural') {
      this.activateProceduralMap();
      this.selectedMapId = id;
      this.placePlayerForMap();
      this.clearActors();
      this.spawnWave(0, true);
      this.cam.snapBehind(this.player.object);
      this.emitHud();
      return;
    }

    // GLB-Map
    try {
      let map = this.mapCache.get(id);
      if (!map) {
        console.info(`[FightJet] Lade Map ${id}…`);
        const loaded = await loadGlbMap(def);
        console.info(
          `[FightJet] Map ${id}: rawSpan=${loaded.rawSpan.toFixed(0)}m → scaled=${loaded.scaledSpan.toFixed(0)}m world=${loaded.size}m y=${loaded.minY.toFixed(0)}..${loaded.maxY.toFixed(0)}`
        );
        map = new GlbMapTerrain(loaded);
        this.mapCache.set(id, map);
      }
      this.activateGlbMap(map, def.showSea, def.fogFar, def.worldSizeM);
      this.selectedMapId = id;
      this.placePlayerForMap();
      this.clearActors();
      this.spawnWave(0, true);
      this.cam.snapBehind(this.player.object);
      this.emitHud();
    } catch (err) {
      console.error(`[FightJet] Map ${id} fehlgeschlagen:`, err);
      // Fallback Islands
      this.activateProceduralMap();
      this.selectedMapId = 'islands';
      this.placePlayerForMap();
      this.emitHud();
      throw err;
    }
  }

  private activateProceduralMap() {
    if (this.glbMap) {
      this.engine.scene.remove(this.glbMap.group);
      this.glbMap = null;
    }
    this.proceduralTerrain.mesh.visible = true;
    this.sea.setVisible(true);
    this.heightField = this.proceduralTerrain;
    const def = getMapDef('islands');
    this.sky.rebuildClouds(def.worldSizeM);
    this.engine.setFog(1400, def.fogFar, 0x91acb7);
  }

  private activateGlbMap(map: GlbMapTerrain, showSea: boolean, fogFar: number, worldSize: number) {
    if (this.glbMap && this.glbMap !== map) {
      this.engine.scene.remove(this.glbMap.group);
    }
    this.proceduralTerrain.mesh.visible = false;
    this.glbMap = map;
    if (!map.group.parent) this.engine.scene.add(map.group);
    this.heightField = map;
    this.sea.setVisible(showSea);
    this.sky.rebuildClouds(worldSize);
    this.engine.setFog(CONFIG.world.fogNear, fogFar);
  }

  /** Platziert den Spieler so, dass er direkt in der Luft startet (Takeoff-Fix). */
  private placePlayerForMap() {
    const def = getMapDef(this.selectedMapId);
    const groundY = this.heightField.getHeight(0, 3000);

    // Sicherheitsabstand zum Boden – verhindert, dass der Jet beim Starten
    // auf der Piste klebt oder durch das Terrain fällt.
    const MIN_CLEARANCE = 350; // Meter über Grund, garantiert Airborne-Start
    const spawnY = groundY + Math.max(MIN_CLEARANCE, def.spawnClearance ?? 0);

    this.player.object.position.set(0, spawnY, 3000);

    // Leichter Pitch (Nase ca. 8° nach oben), damit der Jet sofort steigt,
    // auch wenn der Spieler die Steuerung noch nicht bedient.
    const pitchUp = THREE.MathUtils.degToRad(8);
    const startQuat = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(pitchUp, 0, 0, 'YXZ')
    );
    this.player.object.quaternion.copy(startQuat);

    // Richtungsvektor und Geschwindigkeit passend zur Start‑Orientierung setzen.
    this.player.flight.snapVelocityToNose();
    this.player.flight.speed = CONFIG.flight.cruiseSpeed * this.player.flight.speedMult;

    // Re-parent missile rack to keep weapons anchored during takeoff
    this.player.object.add(this.player.missileRack);
  }

  /** Hangar: Jet wählen (lädt GLB, wendet Stats an). */
  async selectJet(id: JetId) {
    this.selectedJetId = id;
    const def = getJetDef(id);
    this.player.applyLoadout(def);
    this.sound.setEngineMode(def.engineType);
    this.player.reset();
    this.player.resetMountedMissiles(this.player.missilesLeft);
    this.placePlayerForMap();
    await this.ensureJetVisual(id);
    this.cam.snapBehind(this.player.object);
    this.emitHud();
  }

  /** Lädt (oder holt aus dem Cache) das GLB-Template eines Jets. */
  private loadJetTemplate(id: JetId): Promise<THREE.Object3D | null> {
    const cached = this.visualCache.get(id);
    if (cached) return Promise.resolve(cached);

    let p = this.visualPromises.get(id);
    if (!p) {
      const def = getJetDef(id);
      if (!def.modelUrl) return Promise.resolve(null);
      p = loadJetGlb(def.modelUrl, {
        orient: {
          // Moderne + Early Jets: Rumpf oft ≥ Spannweite.
          // WWII-Props: Spannweite oft länger → Auto-Align ohne lengthIsLargest.
          lengthIsLargest: def.era === 'modern' || def.era === 'early_jet',
          ...def.modelOrient,
        },
        targetLength: def.physics.modelLengthM,
      })
        .then(({ group, size }) => {
          this.visualCache.set(id, group);
          console.info(
            `[FightJet] Jet ${id} geladen (${def.modelUrl}) size≈` +
              `${size.x.toFixed(1)}×${size.y.toFixed(1)}×${size.z.toFixed(1)} m` +
              (def.modelOrient ? ` orient=${JSON.stringify(def.modelOrient)}` : '') +
              ` era=${def.era}`
          );
          return group;
        })
        .catch((err) => {
          console.warn(`[FightJet] Jet ${id} konnte nicht geladen werden:`, err);
          return null;
        });
      this.visualPromises.set(id, p);
    }
    return p;
  }

  private async ensureJetVisual(id: JetId) {
    const template = await this.loadJetTemplate(id);
    if (!template) return;

    const def = getJetDef(id);
    // Physik/Engine vor Visual, damit Propeller-System greift
    this.player.applyFlightPhysics(def.physics, def.engineType);

    // Frische Kopie für den Spieler (Cache behält Template) + FX-Anker des Jets
    const instance = template.clone(true);
    const fx = jetFxVectors(def);
    this.player.applyExternalVisual(instance, {
      ...fx,
      hideEngineFx: def.engineType === 'piston',
    });
    if (def.stats.missiles > 0) {
      const missileVisualId = missileIdForJet(id);
      await preloadMissileVisual(missileVisualId);
      this.player.configureMountedMissiles(
        () => cloneMissileVisual(missileVisualId),
        def.stats.missiles
      );
    } else {
      this.player.configureMountedMissiles(() => null, 0);
    }
    this.cam.snapBehind(this.player.object);
  }

  onHud(cb: (d: HudData) => void) {
    this.hudListeners.push(cb);
  }

  /** Preload all assets with real progress reporting. Returns when everything is ready. */
  async preloadAllAssets(
    jetId: JetId,
    mapId: MapId,
    onProgress: (pct: number, text: string) => void,
  ): Promise<void> {
    const steps: { pct: number; text: string }[] = [
      { pct: 10, text: 'Lade Jet-Modell...' },
      { pct: 35, text: 'Bewaffnung kalibrieren...' },
      { pct: 50, text: 'Lade Karte...' },
      { pct: 70, text: 'Terrain generieren...' },
      { pct: 85, text: 'Gegner platzieren...' },
      { pct: 95, text: 'Systeme hochfahren...' },
      { pct: 100, text: 'Startbereit!' },
    ];

    onProgress(0, 'Initialisiere...');

    // Step 1: Select jet (loads GLB + missile visuals)
    onProgress(5, steps[0].text);
    this.selectedJetId = jetId;
    const jetDef = getJetDef(jetId);
    this.player.applyLoadout(jetDef);
    this.sound.setEngineMode(jetDef.engineType);
    this.player.reset();
    this.player.resetMountedMissiles(this.player.missilesLeft);

    // Preload the jet visual
    const template = await this.loadJetTemplate(jetId);
    onProgress(20, 'Verarbeite Jet-Geometrie...');
    if (template) {
      this.player.applyFlightPhysics(jetDef.physics, jetDef.engineType);
      const instance = template.clone(true);
      const fx = jetFxVectors(jetDef);
      this.player.applyExternalVisual(instance, {
        ...fx,
        hideEngineFx: jetDef.engineType === 'piston',
      });
    }
    onProgress(steps[1].pct, steps[1].text);

    // Step 2: Missile visuals
    if (jetDef.stats.missiles > 0) {
      const missileVisualId = missileIdForJet(jetId);
      await preloadMissileVisual(missileVisualId);
      this.player.configureMountedMissiles(
        () => cloneMissileVisual(missileVisualId),
        jetDef.stats.missiles,
      );
    } else {
      this.player.configureMountedMissiles(() => null, 0);
    }
    onProgress(steps[2].pct, steps[2].text);

    // Step 3: Map loading
    const mapDef = getMapDef(mapId);
    if (mapDef.kind === 'glb') {
      onProgress(55, 'Lade 3D-Terrain...');
      let map = this.mapCache.get(mapId);
      if (!map) {
        const loaded = await loadGlbMap(mapDef);
        map = new GlbMapTerrain(loaded);
        this.mapCache.set(mapId, map);
      }
      this.activateGlbMap(map, mapDef.showSea, mapDef.fogFar, mapDef.worldSizeM);
    } else {
      this.activateProceduralMap();
    }
    this.selectedMapId = mapId;
    onProgress(steps[3].pct, steps[3].text);

    // Step 4: Place player & spawn
    this.placePlayerForMap();
    onProgress(steps[4].pct, steps[4].text);

    // Step 5: Initialize sound & spawn enemies
    this.sound.init();
    const def2 = getJetDef(this.selectedJetId);
    this.sound.setEngineMode(def2.engineType);
    this.player.applyLoadout(def2);
    this.player.reset();
    this.player.resetMountedMissiles(this.player.missilesLeft);
    this.clearActors();
    this.waveIndex = 0;
    this.waveDelay = 0;
    this.spawnWave(0);
    onProgress(steps[5].pct, steps[5].text);

    this.cam.snapBehind(this.player.object);
    onProgress(steps[6].pct, steps[6].text);

    // Brief pause so player sees 100%
    await new Promise(r => setTimeout(r, 300));
    this.state = 'playing';
    this.setPlayCursor(true);
    this.emitHud();
  }

  async startGame(jetId?: JetId) {
    if (jetId) await this.selectJet(jetId);
    else await this.ensureJetVisual(this.selectedJetId);

    this.sound.init();
    const def = getJetDef(this.selectedJetId);
    this.sound.setEngineMode(def.engineType);
    this.player.applyLoadout(def);
    this.player.reset();
    this.player.resetMountedMissiles(this.player.missilesLeft);
    this.placePlayerForMap();
    this.clearActors();
    this.waveIndex = 0;
    this.waveDelay = 0;
    this.spawnWave(0);
    this.cam.snapBehind(this.player.object);
    this.state = 'playing';
    this.setPlayCursor(true);
    this.emitHud();
  }

  /** Zurück ins Hauptmenü (Hangar). */
  returnToMenu() {
    this.state = 'menu';
    this.clearActors();
    this.spawnWave(0, true);
    this.player.reset();
    this.player.resetMountedMissiles(this.player.missilesLeft);
    this.placePlayerForMap();
    this.cam.snapBehind(this.player.object);
    this.setPlayCursor(false);
    this.emitHud();
  }

  togglePause() {
    if (this.state === 'playing') {
      // Free-Look beenden bei Pause
      if (this.cam.isFreeLook) {
        this.cam.toggleFreeLook();
        if (document.pointerLockElement) document.exitPointerLock?.();
      }
      this.state = 'paused';
      this.setPlayCursor(false);
    } else if (this.state === 'paused') {
      this.state = 'playing';
      this.setPlayCursor(true);
    }
    this.emitHud();
  }

  /** System-Cursor ausblenden — Aim-Reticle ist der Cursor */
  private setPlayCursor(playing: boolean) {
    this.engine.renderer.domElement.style.cursor = playing ? 'none' : '';
  }

  /** Test/Debug: springt zur angegebenen Welle (0-basiert). */
  debugGotoWave(index: number) {
    this.clearActors();
    this.waveIndex = Math.max(0, Math.min(index, CONFIG.mission.waves.length - 1));
    this.waveDelay = 0;
    this.spawnWave(this.waveIndex);
    this.state = 'playing';
    this.emitHud();
  }

  get missionWaveIndex() {
    return this.waveIndex;
  }

  private clearActors() {
    for (const e of this.enemies) this.engine.scene.remove(e.object);
    this.enemies = [];
    for (const s of this.sams) this.engine.scene.remove(s.object);
    this.sams = [];
    for (const m of this.missiles) this.engine.scene.remove(m.object);
    this.missiles = [];
    this.enemyFireTimers.clear();
  }

  private spawnWave(index: number, forMenu = false) {
    const wave = CONFIG.mission.waves[index];
    if (!wave) return;

    // Tote Actor aus vorheriger Welle entfernen (Array + Szene sauber halten)
    for (const e of this.enemies) {
      if (!e.alive) this.engine.scene.remove(e.object);
    }
    this.enemies = this.enemies.filter((e) => e.alive);
    for (const s of this.sams) {
      if (!s.alive) this.engine.scene.remove(s.object);
    }
    this.sams = this.sams.filter((s) => s.alive);

    // Bandits — frühe Wellen: mehr Legacy (Props/MiG-15), später Mix mit modernen Jets
    const waveSpeedScale = wave.speedScale ?? 1;
    const waveEnemyMissiles = wave.enemyMissiles !== false;
    const newBandits: EnemyJet[] = [];
    for (let i = 0; i < wave.bandits; i++) {
      const jetId = this.pickBanditJetId(index);
      const e = new EnemyJet(this.enemyCounter++, jetId);
      e.applyWaveModifiers({
        speedScale: waveSpeedScale,
        enemyMissiles: waveEnemyMissiles,
      });
      e.spawn(this.player.position);
      e.clearMissileLoadout();
      this.enemies.push(e);
      newBandits.push(e);
      this.engine.scene.add(e.object);
      this.applyEnemyVisual(e);
    }

    // Pro Welle: max. EIN Bandit mit wenigen Raketen (Training: enemyMissiles=false)
    const shots = CONFIG.enemy.missilesPerWave ?? 2;
    if (newBandits.length > 0 && shots > 0 && !forMenu && waveEnemyMissiles) {
      const armed = newBandits.filter((b) => b.loadout.stats.missiles > 0);
      const pool = armed.length > 0 ? armed : newBandits;
      const shooter = pool[Math.floor(Math.random() * pool.length)];
      shooter.assignWaveMissileLoadout(shots);
    }

    // SAM-Stellungen auf das Terrain setzen (mind. 1,5 km vom Spieler weg)
    for (let i = 0; i < wave.sams; i++) {
      const pos = new THREE.Vector3(
        this.player.position.x + 2000 + i * 400,
        50,
        this.player.position.z - 2500 - i * 300
      );
      for (let tries = 0; tries < 40; tries++) {
        const x = (Math.random() * 2 - 1) * 7000;
        const z = (Math.random() * 2 - 1) * 7000;
        const y = this.heightField.getHeight(x, z);
        const half = this.heightField.size * 0.35;
        if (
          y > 10 &&
          y < 2500 &&
          Math.abs(x) < half &&
          Math.abs(z) < half &&
          this.player.position.distanceTo(new THREE.Vector3(x, y, z)) > 1500
        ) {
          pos.set(x, y, z);
          break;
        }
      }
      // Terrain-Höhe final setzen (Fallback-Pos ebenfalls)
      pos.y = this.heightField.getHeight(pos.x, pos.z);
      const sam = new SamSite(i, pos);
      this.sams.push(sam);
      this.engine.scene.add(sam.object);
    }

    if (!forMenu) {
      this.waveBanner = wave.label;
      this.waveBannerTimer = 4;
    }
  }

  /**
   * Wellen-Mix: optional Legacy (Props/Early Jet), sonst moderne Jets.
   * Legacy-Pool ist aktuell leer (Assets archiviert unter archived-aircraft/).
   */
  private pickBanditJetId(waveIndex: number): JetId {
    const legacy = legacyJetIds();
    const modern = JET_CATALOG.filter((j) => j.era === 'modern').map((j) => j.id);
    const legacyBias =
      waveIndex <= 0 ? 0.82 : waveIndex === 1 ? 0.5 : 0.28;
    const pool =
      Math.random() < legacyBias && legacy.length > 0
        ? legacy
        : modern.length > 0
          ? modern
          : JET_CATALOG.map((j) => j.id);
    return pool[Math.floor(Math.random() * pool.length)];
  }

  /** Hängt das GLB-Visual des zugewiesenen Jets an einen Gegner (sobald geladen). */
  private applyEnemyVisual(e: EnemyJet) {
    void this.loadJetTemplate(e.jetId).then((template) => {
      if (template && e.alive) {
        e.applyFlightPhysics(e.loadout.physics, e.loadout.engineType);
        e.applyExternalVisual(template.clone(true), {
          ...jetFxVectors(e.loadout),
          hideEngineFx: e.loadout.engineType === 'piston',
        });
      }
    });
  }

  private update = (dt: number) => {
    this.time += dt;

    // Globale Tasten
    if (this.input.wasPressed('KeyP') || this.input.wasPressed('Escape')) this.togglePause();
    // V = Cockpit / Chase umschalten
    if (this.input.wasPressed('KeyV') && this.state === 'playing') {
      this.cam.toggleCockpit();
    }
    if (this.input.wasPressed('Enter') &&
        (this.state === 'menu' || this.state === 'gameover' || this.state === 'victory')) {
      this.startGame();
    }

    // Free-Look vor Input-Update lesen (C halten / RMB)
    const freeHeldPreview = this.input.isDown('KeyC') || this.input.rightMouse;
    this.input.update(dt, {
      freeLook: freeHeldPreview || this.cam.isFreeLook,
      playing: this.state === 'playing',
    });

    if (this.state === 'playing') {
      this.updatePlaying(dt);
    }

    // Welt läuft immer weiter
    this.sky.update(dt, this.player.position);
    this.proceduralTerrain.update(this.time);
    this.sea.update(this.time, this.player.position);
    this.effects.update(dt);
    // Ballistik: Ziele für Segment-Kollision (Gegner, SAMs, Spieler)
    this.cannons.update(dt, this.collectCannonTargets());
    if (this.waveBannerTimer > 0) this.waveBannerTimer -= dt;
    if (this.killPopupTimer > 0) {
      this.killPopupTimer -= dt;
      if (this.killPopupTimer <= 0) this.killPopup = null;
    }

    if (this.state === 'menu' || this.state === 'gameover' || this.state === 'victory') {
      // langsame Orbit-Kamera
      const t = this.time * 0.1;
      const p = this.player.position;
      this.engine.camera.position.set(p.x + Math.cos(t) * 40, p.y + 8, p.z + Math.sin(t) * 40);
      this.engine.camera.lookAt(p);
      this.engine.camera.up.set(0, 1, 0);
    }

    this.input.endFrame();

    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 1 / 30;
      this.emitHud();
    }
  };

  private updatePlaying(dt: number) {
    const player = this.player;

    // Wind / Böen (stärker auf Legacy-Zellen im FlightModel)
    this.windField.update(dt);
    this.windField.sample(player.position, this._windSample);
    player.wind.copy(this._windSample);

    // Free-Look: C halten / RMB — Jet behält Kurs, Kamera orbitet
    const free = this.input.freeLookHeld || this.cam.isFreeLook;
    const savedPitch = this.input.pitch;
    const savedRoll = this.input.roll;
    const savedYaw = this.input.yaw;
    if (free) {
      this.input.pitch = 0;
      this.input.roll = 0;
      this.input.yaw = 0;
    }

    // Mouse-Aim: Strahl von Kamera durch Aim-Reticle → Welt-Richtung
    this.computeAimDir();

    // --- Spieler (FBW + Manual Override) ---
    player.update(
      dt,
      this.input,
      this.heightField,
      () => {
        this.effects.explosion(player.position, true);
        this.sound.explosion(true);
        this.state = 'gameover';
        this.setPlayCursor(false);
      },
      {
        aimDir: this.aimDir,
        mouseAim: !free && !this.input.manualOverride,
        freeLook: free,
      }
    );

    if (free) {
      this.input.pitch = savedPitch;
      this.input.roll = savedRoll;
      this.input.yaw = savedYaw;
    }

    // --- Lock-On (Luft + Boden) ---
    this.updateLock(dt);

    // --- Spieler-Waffen (kein Auto-Aim — reiner Vorhalt) ---
    if (player.alive) {
      // Nachladen mit R
      if (this.input.wasPressed('KeyR')) {
        player.startReload();
      }
      if (this.input.cannon && player.canFireCannon()) {
        player.firedCannon();
        this.cannons.fire(
          player,
          null,
          this.effects,
          (victim, dmg) => this.onHit(victim, dmg, player)
        );
        this.sound.cannonShot();
      }
      if (this.input.wasPressed('KeyM') || this.input.wasPressed('KeyF')) {
        if (
          player.hasMissiles &&
          player.missilesLeft > 0 &&
          player.lockTarget &&
          player.lockProgress >= 1
        ) {
          this.launchPlayerMissile();
        }
      }
      // Flares / Gegenmaßnahmen (War Thunder: Rakete kommt → X → 50/50 Spoof)
      if (this.input.wasPressed('KeyX') || this.input.wasPressed('KeyZ')) {
        this.popPlayerFlares();
      }
    }

    // --- Gegner ---
    for (const e of this.enemies) {
      if (e.alive) {
        this.windField.sample(e.position, e.wind);
        e.update(dt, player, this.heightField);
        if (e.wantsToFire() && player.alive) {
          const timer = (this.enemyFireTimers.get(e) ?? 0) - dt;
          if (timer <= 0) {
            this.cannons.fire(e, player, this.effects, (victim, dmg) => this.onHit(victim, dmg, e));
            this.enemyFireTimers.set(e, 60 / e.cannonRPM);
          } else {
            this.enemyFireTimers.set(e, timer);
          }
        }
        if (e.wantsMissileFire() && player.alive) {
          this.launchEnemyMissile(e);
        }
      } else {
        const done = e.updateDeath(dt);
        if (Math.random() < dt * 20) this.effects.damageSmoke(e.position);
        if (done) {
          // Wrack entfernen (kein Respawn im Missionsmodus)
          e.position.y = -9999;
        }
      }
    }

    // --- SAM-Stellungen ---
    for (const sam of this.sams) {
      sam.update(dt, player, (site) => {
        // SAM-Rakete auf den Spieler (langsameres Profil → Flares möglich)
        const toPlayer = player.position.clone().sub(site.position).normalize();
        const launchDir = toPlayer.lerp(new THREE.Vector3(0, 1, 0), 0.35).normalize();
        const m = new Missile(
          player,
          site.position.clone().add(new THREE.Vector3(0, 8, 0)),
          launchDir,
          site,
          this.effects,
          { carrierSpeed: 40, profile: 'sam' }
        );
        this.missiles.push(m);
        this.engine.scene.add(m.object);
        this.sound.missileLaunch();
      });
      if (!sam.alive && Math.random() < dt * 6) {
        this.effects.damageSmoke(sam.position.clone().add(new THREE.Vector3(0, 4, 0)));
      }
    }

    // --- Raketen ---
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i];
      const res = m.update(dt);
      if (res.expired) {
        if (res.hit) {
          const victim = res.hit;
          const isSam = this.sams.includes(victim as SamSite);
          const dmg = m.damage;
          const killed = victim.takeDamage(dmg);
          if (victim.isPlayer) {
            if (killed) this.onPlayerKilled();
          } else if (isSam) {
            if (killed) {
              this.player.score += CONFIG.score.samKill;
              this.showKillPopup((victim as SamSite).name ?? 'SAM SITE', CONFIG.score.samKill, 'ground');
              if (this.player.lockTarget === victim) this.clearLock();
            }
          } else if (killed) {
            this.onEnemyKilled(victim as unknown as EnemyJet);
          }
        }
        this.engine.scene.remove(m.object);
        this.missiles.splice(i, 1);
      }
    }

    // --- Spieler-Schadensrauch ---
    if (player.alive && player.hp < 40 && Math.random() < dt * 8) {
      this.effects.damageSmoke(player.position);
    }

    // --- Missions-Fortschritt ---
    this.updateMission(dt);

    // --- Kamera & Sound ---
    const lookDelta = free ? this.input.freeLookDelta(dt) : undefined;
    const trackPos =
      !free &&
      player.lockProgress >= 1 &&
      player.lockTarget?.alive
        ? player.lockTarget.object.position
        : null;
    this.cam.update(
      dt,
      player.object,
      player.flight.speed,
      this.engine.camera,
      lookDelta,
      trackPos,
      {
        freeLookHeld: this.input.freeLookHeld,
        gForce: player.flight.gForce,
        afterburner:
          this.input.afterburner && player.alive && player.hasAfterburner,
        firing: this.input.cannon && player.alive,
        stalled: player.flight.stalled && player.alive,
        airbrake: this.input.airbrake,
        camFit: player.camFit,
        rollRate: player.flight.rollRateActual,
        bank: player.flight.bankSigned,
        buffeting: player.alive ? player.buffeting : 0,
      }
    );
    this.sound.setEngineMode(player.engineType);
    this.sound.updateEngine(
      player.flight.speed / CONFIG.flight.afterburnerSpeed,
      this.input.throttle,
      this.input.afterburner && player.alive && player.hasAfterburner,
      dt,
      player.propeller.active ? player.propeller.state.rpm : this.input.throttle
    );
    // Lock-Ton nur wenn Lenkwaffen verfügbar
    this.sound.setLockTone(
      player.alive && player.hasMissiles ? player.lockProgress : 0
    );
    if (player.flight.stalled && player.alive) this.sound.stallWarning(true);
  }

  /** Unproject Aim-NDC → Welt-Richtungsvektor für FBW */
  private computeAimDir() {
    const cam = this.engine.camera;
    const margin = CONFIG.flight.aimMargin;
    const ax = THREE.MathUtils.clamp(this.input.aimX, -margin, margin);
    const ay = THREE.MathUtils.clamp(this.input.aimY, -margin, margin);

    // Ray durch Near-Plane-Punkt
    this._ndc.set(ax, ay, 0.5);
    this._ndc.unproject(cam);
    this.aimDir.copy(this._ndc).sub(cam.position).normalize();

    // Fallback: wenn unproject degeneriert, Nase nutzen
    if (this.aimDir.lengthSq() < 0.5) {
      this.aimDir.copy(this.player.forward);
    }
  }

  /** Weltpunkt → HUD % Position */
  private projectToScreen(world: THREE.Vector3): ScreenPos {
    this._proj.copy(world).project(this.engine.camera);
    const inFront = this._proj.z < 1;
    const onScreen =
      inFront &&
      this._proj.x > -1.35 &&
      this._proj.x < 1.35 &&
      this._proj.y > -1.35 &&
      this._proj.y < 1.35;
    return {
      x: THREE.MathUtils.clamp((this._proj.x * 0.5 + 0.5) * 100, 0, 100),
      y: THREE.MathUtils.clamp((-this._proj.y * 0.5 + 0.5) * 100, 0, 100),
      visible: onScreen,
    };
  }

  private updateMission(dt: number) {
    const banditsLeft = this.enemies.filter((e) => e.alive).length;
    const samsLeft = this.sams.filter((s) => s.alive).length;

    if (banditsLeft > 0 || samsLeft > 0) {
      this.waveDelay = 0;
      return;
    }

    // Welle geschafft
    this.waveDelay += dt;
    if (this.waveDelay >= CONFIG.mission.waveDelay) {
      this.waveDelay = 0;
      this.waveIndex++;
      if (this.waveIndex >= CONFIG.mission.waves.length) {
        this.state = 'victory';
        this.setPlayCursor(false);
        this.emitHud();
      } else {
        this.spawnWave(this.waveIndex);
      }
    }
  }

  private clearLock() {
    this.player.lockTarget = null;
    this.player.lockProgress = 0;
  }

  /** Alle Damageables für Kanonen-Ballistik */
  private collectCannonTargets(): Damageable[] {
    const list: Damageable[] = [];
    if (this.player.alive) list.push(this.player);
    for (const e of this.enemies) if (e.alive) list.push(e);
    for (const s of this.sams) if (s.alive) list.push(s);
    return list;
  }

  /**
   * Lead-Indicator (War Thunder): Vorhalt-Punkt für fokussiertes Ziel.
   * Geglättet + etwas „weicherer“ Vorhalt, damit man dem gelben Fadenkreuz
   * leichter mit der Nase folgen kann.
   */
  private computeLeadIndicator(): ScreenPos | null {
    const p = this.player;
    if (!p.alive || this.state !== 'playing') {
      this.leadSmoothActive = false;
      return null;
    }

    const bulletSpeed = CONFIG.player.bulletSpeed;
    const maxRange = CONFIG.player.cannonRange;
    const maxDisplay = 1300;

    let target: Damageable | null = null;
    if (p.lockTarget?.alive) {
      target = p.lockTarget;
    } else {
      let bestD = Infinity;
      const candidates: Damageable[] = [
        ...this.enemies.filter((e) => e.alive),
        ...this.sams.filter((s) => s.alive),
      ];
      for (const t of candidates) {
        const to = t.object.position.clone().sub(p.position);
        const d = to.length();
        if (d > maxRange || d > maxDisplay || d < 20) continue;
        to.multiplyScalar(1 / d);
        // Etwas großzügigerer Konus → Lead bleibt länger sichtbar
        if (to.dot(p.forward) < 0.05) continue;
        if (d < bestD) {
          bestD = d;
          target = t;
        }
      }
    }
    if (!target?.alive) {
      this.leadSmoothActive = false;
      return null;
    }

    const dist = target.object.position.distanceTo(p.position);
    if (dist > maxDisplay) {
      this.leadSmoothActive = false;
      return null;
    }

    // Zielgeschwindigkeit (Jets über FlightModel; SAMs = 0)
    const targetVel = new THREE.Vector3();
    if ('flight' in target) {
      const fl = (target as EnemyJet).flight;
      if (fl?.velocity) targetVel.copy(fl.velocity);
    }
    // Etwas weniger Vorhalt (0.82) → Fadenkreuz näher am Jet, leichter zu folgen
    // (Kugeln sind mit 1050 m/s schnell genug, dass es noch trifft)
    targetVel.multiplyScalar(0.82);

    // Iterativer Vorhalt: t = dist/v, lead = pos + vel*t
    let lead = target.object.position.clone();
    let tHit = dist / bulletSpeed;
    for (let i = 0; i < 3; i++) {
      lead.copy(target.object.position).addScaledVector(targetVel, tHit);
      tHit = p.position.distanceTo(lead) / bulletSpeed;
    }

    const screen = this.projectToScreen(lead);
    if (!screen.visible) {
      this.leadSmoothActive = false;
      return null;
    }

    // Bildschirm-Glättung — weniger Zucken, Nase kann „mitschwimmen“
    const smooth = 0.22;
    if (this.leadSmoothActive) {
      this.leadSmoothX += (screen.x - this.leadSmoothX) * smooth;
      this.leadSmoothY += (screen.y - this.leadSmoothY) * smooth;
    } else {
      this.leadSmoothX = screen.x;
      this.leadSmoothY = screen.y;
      this.leadSmoothActive = true;
    }

    return {
      x: this.leadSmoothX,
      y: this.leadSmoothY,
      visible: true,
    };
  }

  private updateLock(dt: number) {
    const player = this.player;
    // Propeller / Early Jets ohne Lenkwaffen: kein Lock-On
    if (!player.hasMissiles) {
      player.lockTarget = null;
      player.lockProgress = 0;
      return;
    }
    const lockRange = player.lockRange;
    const lockTime = player.lockTime;
    const cone = THREE.MathUtils.degToRad(player.lockAngleDeg);

    const targets: Damageable[] = [
      ...this.enemies.filter((e) => e.alive),
      ...this.sams.filter((s) => s.alive),
    ];

    const valid = (t: Damageable | null): t is Damageable =>
      !!t && t.alive &&
      t.object.position.distanceTo(player.position) < lockRange &&
      player.forward.angleTo(t.object.position.clone().sub(player.position).normalize()) < cone;

    let target = player.lockTarget;
    if (!valid(target)) {
      target = null;
      let bestAngle = cone;
      for (const t of targets) {
        if (!valid(t)) continue;
        const a = player.forward.angleTo(t.object.position.clone().sub(player.position).normalize());
        if (a < bestAngle) { bestAngle = a; target = t; }
      }
      player.lockProgress = 0;
    }

    player.lockTarget = target;
    if (target) {
      player.lockProgress = Math.min(1, player.lockProgress + dt / lockTime);
    } else {
      player.lockProgress = 0;
    }
  }

  private onHit(victim: Damageable, dmg: number, shooter: Damageable) {
    const killed = victim.takeDamage(dmg);
    if (victim.isPlayer) {
      if (killed) this.onPlayerKilled();
      return;
    }
    const isSam = this.sams.includes(victim as SamSite);
    if (shooter.isPlayer) this.player.score += CONFIG.score.hitBonus;
    if (killed) {
      if (isSam) {
        this.effects.explosion((victim as SamSite).position.clone().add(new THREE.Vector3(0, 4, 0)), true);
        this.sound.explosion(true);
        this.player.score += CONFIG.score.samKill;
        this.showKillPopup((victim as SamSite).name ?? 'SAM SITE', CONFIG.score.samKill, 'ground');
        if (this.player.lockTarget === victim) this.clearLock();
      } else {
        this.onEnemyKilled(victim as unknown as EnemyJet);
      }
    }
  }

  private onEnemyKilled(e: EnemyJet) {
    this.effects.explosion(e.position, true);
    this.sound.explosion(true);
    this.player.score += CONFIG.score.kill;
    this.showKillPopup(e.name, CONFIG.score.kill, 'air');
    if (this.player.lockTarget === (e as unknown as Damageable)) this.clearLock();
  }

  /** Gegner-Luft-Luft-Rakete (langsames Profil, flare-fähig) */
  private launchEnemyMissile(e: EnemyJet) {
    const player = this.player;
    if (!player.alive || !e.alive) return;
    const toPlayer = player.position.clone().sub(e.position);
    if (toPlayer.lengthSq() < 1) return;
    const startDir = toPlayer.normalize().lerp(e.forward, 0.35).normalize();
    const start = e.position.clone().addScaledVector(e.forward, 8).add(new THREE.Vector3(0, -0.8, 0));
    const m = new Missile(player, start, startDir, e, this.effects, {
      carrierSpeed: e.flight.speed,
      profile: 'enemy',
    });
    this.missiles.push(m);
    this.engine.scene.add(m.object);
    this.sound.missileLaunch();
  }

  /**
   * Flare-Salve: gestaffelte IR-Köder-Wolke + 50/50-Chance,
   * alle auf den Spieler gelenkten Raketen zu spoofen.
   */
  private popPlayerFlares() {
    const player = this.player;
    if (!player.alive || !player.hasFlares) return;
    if (!player.tryPopFlares()) return;

    const back = player.forward.clone().multiplyScalar(-1);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(player.object.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(player.object.quaternion);
    const origin = player.position
      .clone()
      .addScaledVector(back, 5.5)
      .addScaledVector(up, -1.1);
    // Jet-Geschwindigkeit für realistischen Flare-Trail
    const jetVel = player.forward.clone().multiplyScalar(player.flight.speed);

    this.effects.flareBurst(origin, back, {
      right,
      up,
      jetVelocity: jetVel,
      count: 16,
    });
    this.sound.flarePop();

    // Spoof: jede eingehende Lenkwaffe hat ~50 % Chance, den Lock zu verlieren
    const chance = CONFIG.player.flareSpoofChance ?? 0.5;
    for (const m of this.missiles) {
      if (!m.targetIs(player)) continue;
      if (Math.random() < chance) {
        m.decoy();
      }
    }
  }

  /**
   * Rakete vom nächsten Hardpoint des Jets abfeuern (nicht aus dem Rumpf-Zentrum).
   * 3D-Visual + Drop/Boost-Flugbahn zum gelockten Ziel.
   */
  private launchPlayerMissile() {
    const player = this.player;
    const target = player.lockTarget;
    if (!target?.alive || player.missilesLeft <= 0) return;

    player.missilesLeft--;
    const hardpoints = player.getHardpoints();
    const idx = player.missileStation % Math.max(1, hardpoints.length);
    player.missileStation++;
    player.releaseMountedMissile(idx);
    const local = hardpoints[idx] ?? new THREE.Vector3(0, -0.5, 1);
    const worldPos = local
      .clone()
      .applyQuaternion(player.object.quaternion)
      .add(player.position);

    // Eject: leicht nach außen und unten (realistischer Drop vom Pylon)
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(player.object.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(player.object.quaternion);
    const side = Math.sign(local.x) || (idx % 2 === 0 ? -1 : 1);
    const eject = new THREE.Vector3()
      .addScaledVector(right, side * (CONFIG.missile.ejectSpeed ?? 12))
      .addScaledVector(up, -(CONFIG.missile.ejectSpeed ?? 12) * 0.65);

    // Start-Richtung: leicht nach vorne-unten (nicht exakt Nase)
    const startDir = player.forward.clone().addScaledVector(up, -0.08).normalize();

    const visId = missileIdForJet(player.jetId);
    const visual = cloneMissileVisual(visId);

    const m = new Missile(target, worldPos, startDir, player, this.effects, {
      visual,
      carrierSpeed: player.flight.speed,
      ejectWorld: eject,
    });
    this.missiles.push(m);
    this.engine.scene.add(m.object);
    this.sound.missileLaunch();
  }

  /** Kill-Confirm-Popup für HUD (Glass Splash) */
  private showKillPopup(targetName: string, points: number, kind: 'air' | 'ground') {
    this.killPopupSeq += 1;
    const titles =
      kind === 'air'
        ? ['SPLASH ONE', 'KILL CONFIRMED', 'BANDIT DOWN', 'TARGET DESTROYED']
        : ['SAM DESTROYED', 'GROUND KILL', 'SITE CLEARED'];
    this.killPopup = {
      id: this.killPopupSeq,
      title: titles[this.killPopupSeq % titles.length],
      targetName,
      points,
      kind,
    };
    this.killPopupTimer = 2.8;
    this.emitHud();
  }

  private onPlayerKilled() {
    this.effects.explosion(this.player.position, true);
    this.sound.explosion(true);
    this.state = 'gameover';
    this.setPlayCursor(false);
    this.emitHud();
  }

  private emitHud() {
    const p = this.player;
    const range = CONFIG.hud.radarRange;
    const radar: HudData['radar'] = [];
    const invQ = p.object.quaternion.clone().invert();
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const rel = e.position.clone().sub(p.position).applyQuaternion(invQ);
      radar.push({
        x: THREE.MathUtils.clamp(rel.x / range, -1, 1),
        y: THREE.MathUtils.clamp(rel.z / range, -1, 1),
        kind: 'bandit',
        locked: p.lockTarget === (e as unknown as Damageable) && p.lockProgress >= 1,
      });
    }
    for (const s of this.sams) {
      if (!s.alive) continue;
      const rel = s.position.clone().sub(p.position).applyQuaternion(invQ);
      radar.push({
        x: THREE.MathUtils.clamp(rel.x / range, -1, 1),
        y: THREE.MathUtils.clamp(rel.z / range, -1, 1),
        kind: 'sam',
        locked: p.lockTarget === (s as unknown as Damageable) && p.lockProgress >= 1,
      });
    }
    // Eingehende / eigene Lenkwaffen auf dem Radar (WT-Style Threat)
    for (const m of this.missiles) {
      if (!m.alive) continue;
      const rel = m.position.clone().sub(p.position).applyQuaternion(invQ);
      const dist = Math.hypot(rel.x, rel.z);
      if (dist > range * 1.15) continue;
      radar.push({
        x: THREE.MathUtils.clamp(rel.x / range, -1, 1),
        y: THREE.MathUtils.clamp(rel.z / range, -1, 1),
        kind: 'missile',
        locked: false,
        incoming: m.isIncomingThreat(),
      });
    }

    let warning: string | null = null;
    if (p.flight.stalled && p.alive) warning = 'STALL';
    else if (p.hp < 30 && p.alive) warning = 'DAMAGE';
    const missileThreat = this.missiles.some((m) => m.targetIs(p));
    if (missileThreat) warning = 'MISSILE — X FLARES';
    else if (p.flareCloudTimer > 0.05 && p.alive) warning = 'FLARES OUT';

    // Lock-Ziel auf Bildschirm projizieren
    let lockScreen: HudData['lockScreen'] = null;
    if (p.lockTarget && p.lockTarget.alive) {
      const ndc = p.lockTarget.object.position.clone().project(this.engine.camera);
      if (ndc.z < 1) {
        lockScreen = {
          x: THREE.MathUtils.clamp((ndc.x * 0.5 + 0.5) * 100, 2, 98),
          y: THREE.MathUtils.clamp((-ndc.y * 0.5 + 0.5) * 100, 2, 98),
        };
      }
    }

    // Gegner-Marker (Leiste über dem Jet + Distanz)
    const worldMarkers: HudData['worldMarkers'] = [];
    if (this.state === 'playing' || this.state === 'paused') {
      for (const e of this.enemies) {
        if (!e.alive) continue;
        // Marker etwas über dem Jet
        const world = e.object.position.clone().add(new THREE.Vector3(0, 8, 0));
        const ndc = world.project(this.engine.camera);
        const inFront = ndc.z < 1 && ndc.x > -1.2 && ndc.x < 1.2 && ndc.y > -1.2 && ndc.y < 1.2;
        const distM = Math.round(e.position.distanceTo(p.position));
        worldMarkers.push({
          x: THREE.MathUtils.clamp((ndc.x * 0.5 + 0.5) * 100, 1, 99),
          y: THREE.MathUtils.clamp((-ndc.y * 0.5 + 0.5) * 100, 1, 99),
          name: e.name,
          hp: Math.max(0, Math.round(e.hp)),
          maxHp: e.maxHpPublic,
          distM,
          locked: p.lockTarget === (e as unknown as Damageable) && p.lockProgress >= 1,
          visible: inFront && distM < 6000,
        });
      }
    }

    const hullPct = Math.round((Math.max(0, p.hp) / Math.max(1, p.maxHp)) * 100);
    let dmgStatus = 'NOMINAL';
    if (hullPct <= 25) dmgStatus = 'CRITICAL';
    else if (hullPct <= 50) dmgStatus = 'HEAVY DAMAGE';
    else if (hullPct <= 75) dmgStatus = 'LIGHT DAMAGE';
    const damage: HudData['damage'] = {
      hullPct,
      status: dmgStatus,
      systems: [
        { name: 'ENGINE', ok: hullPct > 20 },
        { name: 'FLIGHT CTRL', ok: hullPct > 35 },
        { name: 'RADAR', ok: hullPct > 40 },
        { name: 'WEAPONS', ok: hullPct > 15 },
        { name: 'HYDRAULICS', ok: hullPct > 50 },
      ],
    };

    // Triple-Reticle — Gun-Boresight aus echten Mündungen (pro Jet kalibriert)
    const aimDist = 800;
    const gunWorld = p.getGunBoresight(aimDist);
    const velWorld = p.position
      .clone()
      .addScaledVector(p.flight.velocityDir, aimDist);
    const gunCrosshair = this.projectToScreen(gunWorld);
    const velocityVector = this.projectToScreen(velWorld);
    // Maus-Reticle: NDC → %
    const mouseReticle: ScreenPos = {
      x: (this.input.aimX * 0.5 + 0.5) * 100,
      y: (-this.input.aimY * 0.5 + 0.5) * 100,
      visible: this.state === 'playing' && !this.cam.isFreeLook,
    };
    const leadIndicator = this.computeLeadIndicator();

    const wave = CONFIG.mission.waves[Math.min(this.waveIndex, CONFIG.mission.waves.length - 1)];
    const data: HudData = {
      state: this.state,
      speedKnots: Math.round(p.speedKnots),
      altitudeFt: Math.round(p.position.y * 3.281),
      headingDeg: Math.round(p.headingDeg),
      throttle: this.input.throttle,
      afterburner: this.input.afterburner && p.hasAfterburner,
      stalled: p.flight.stalled,
      freeLook: this.cam.isFreeLook,
      autoTrack: this.cam.isTracking && p.lockProgress >= 1,
      mouseReticle,
      velocityVector,
      gunCrosshair,
      leadIndicator,
      ammo: p.ammo,
      maxAmmo: p.maxAmmo,
      reloading: p.reloading,
      reloadProgress: p.reloadProgress,
      manualOverride: this.input.manualOverride,
      airbrake: this.input.airbrake,
      gForce: p.flight.gForce,
      hp: Math.max(0, Math.round(p.hp)),
      maxHp: p.maxHp,
      score: p.score,
      missiles: p.missilesLeft,
      flares: p.flaresLeft,
      maxFlares: p.maxFlares,
      flareActive: p.flareCloudTimer > 0.05,
      enemiesAlive: this.enemies.filter((e) => e.alive).length,
      lockProgress: p.lockProgress,
      lockedTargetName: p.lockProgress >= 1 && p.lockTarget ? p.lockTarget.name : null,
      lockScreen,
      warning,
      radar,
      worldMarkers,
      damage,
      waveIndex: this.waveIndex,
      waveCount: CONFIG.mission.waves.length,
      waveLabel: wave.label,
      samsLeft: this.sams.filter((s) => s.alive).length,
      waveBanner: this.waveBannerTimer > 0 ? this.waveBanner : null,
      selectedJetId: this.selectedJetId,
      jetName: this.player.loadout.name,
      selectedMapId: this.selectedMapId,
      mapName: getMapDef(this.selectedMapId).name,
      killPopup: this.killPopup,
    };
    for (const cb of this.hudListeners) cb(data);
  }

  private render = () => {
    this.engine.render();
  };

  /** Einstellungen: Sound */
  setSoundMuted(muted: boolean) {
    this.sound.setMuted(muted);
  }

  setSoundVolume(volume: number) {
    this.sound.setMasterVolume(volume);
  }

  dispose() {
    this.loop.stop();
    this.input.dispose();
    this.engine.renderer.domElement.removeEventListener('contextmenu', this.onContextMenu);
    this.engine.dispose();
  }
}
