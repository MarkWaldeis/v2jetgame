import { useCallback, useEffect, useRef, useState } from 'react';
import { Game, type HudData } from './game/Game';
import { Hud } from './components/Hud';
import { Menus } from './components/Menus';
import type { JetId } from './game/aircraft/JetCatalog';
import type { MapId } from './game/world/MapCatalog';
import {
  loadSettings,
  saveSettings,
  purchaseJet,
  isJetOwned,
  completeCampaignLevel,
} from './lib/gameSettings';
import { disposePreviewRenderers } from './lib/previewGpu';
import { getCampaignLevel } from './game/campaign/CampaignCatalog';

const initialHud: HudData = {
  state: 'menu',
  speedKnots: 0, altitudeFt: 0, headingDeg: 0, throttle: 0.6,
  afterburner: false, stalled: false, freeLook: false, autoTrack: false, gForce: 1,
  hp: 100, maxHp: 100, score: 0, missiles: 6, weaponLabel: 'AIM-9 Sidewinder',
  flares: 0, maxFlares: 0, flareActive: false, enemiesAlive: 4,
  lockProgress: 0, lockedTargetName: null, lockScreen: null, warning: null, radar: [],
  mouseReticle: { x: 50, y: 50, visible: false },
  velocityVector: { x: 50, y: 50, visible: false },
  gunCrosshair: { x: 50, y: 50, visible: false },
  leadIndicator: null,
  ammo: 500,
  maxAmmo: 500,
  reloading: false,
  reloadProgress: 1,
  manualOverride: false,
  airbrake: false,
  worldMarkers: [],
  damage: {
    hullPct: 100,
    status: 'NOMINAL',
    panelTitle: 'AIRFRAME',
    systems: [
      { name: 'ENGINE', ok: true },
      { name: 'FLIGHT CTRL', ok: true },
      { name: 'RADAR', ok: true },
      { name: 'WEAPONS', ok: true },
      { name: 'HYDRAULICS', ok: true },
    ],
  },
  waveIndex: 0, waveCount: 4, waveLabel: '', samsLeft: 0, waveBanner: null,
  selectedJetId: 'f16', jetName: 'F-16 Fighting Falcon',
  selectedMapId: 'islands', mapName: 'Stormbreak Archipelago',
  killPopup: null,
};

type AppPhase = 'menu' | 'loading' | 'playing';

function waitFrames(n: number): Promise<void> {
  return new Promise((resolve) => {
    let left = n;
    const tick = () => {
      left -= 1;
      if (left <= 0) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const phaseRef = useRef<AppPhase>('menu');
  const [hud, setHud] = useState<HudData>(initialHud);
  const [phase, setPhase] = useState<AppPhase>('menu');
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingText, setLoadingText] = useState('Initialisiere...');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [credits, setCredits] = useState(() => loadSettings().aeroCredits);
  const mapIdRef = useRef<MapId>(initialHud.selectedMapId);

  const updatePhase = useCallback((next: AppPhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  useEffect(() => {
    setCredits(loadSettings().aeroCredits);
  }, []);

  useEffect(() => {
    if (!canvasRef.current) return;
    const game = new Game(canvasRef.current);
    gameRef.current = game;
    (window as unknown as { __game: Game }).__game = game;
    game.onHud((d) => {
      setHud(d);
      mapIdRef.current = d.selectedMapId;

      // Spiel läuft → Canvas freigeben
      if (d.state === 'playing') {
        if (phaseRef.current !== 'playing') {
          updatePhase('playing');
        }
        return;
      }

      // Mission beendet
      if ((d.state === 'gameover' || d.state === 'victory') && phaseRef.current === 'playing') {
        if (d.state === 'victory') {
          const levelId = gameRef.current?.getCampaignLevelId?.() ?? null;
          if (levelId) {
            const level = getCampaignLevel(levelId);
            const total = completeCampaignLevel(level.id, level.index, level.rewardCredits);
            setCredits(total);
          } else {
            const s = loadSettings();
            s.aeroCredits += 1000;
            saveSettings(s);
            setCredits(s.aeroCredits);
          }
        } else {
          const reward = Math.floor(d.score * 0.5);
          const s = loadSettings();
          s.aeroCredits += reward;
          saveSettings(s);
          setCredits(s.aeroCredits);
        }
        updatePhase('menu');
        return;
      }

      // Pause bleibt phase=playing (Canvas sichtbar), Menü-Overlay kommt aus hud.state
      if (d.state === 'paused') {
        return;
      }

      // Menü-State: Ladescreen NICHT abbrechen
      if (d.state === 'menu') {
        if (phaseRef.current !== 'loading' && phaseRef.current !== 'playing') {
          updatePhase('menu');
        }
        // Während playing darf ein verspäteter menu-HUD-Tick die Phase nicht killen
        if (phaseRef.current === 'playing' && d.state === 'menu') {
          // ignore stale menu ticks while we believe we're playing
        }
        setCredits(loadSettings().aeroCredits);
      }
    });

    const s = loadSettings();
    game.setSoundMuted(s.muted);
    game.setSoundVolume(s.masterVolume);
    game.applySettings({ graphicsQuality: s.graphicsQuality });

    return () => game.dispose();
  }, [updatePhase]);

  const onSoundChange = useCallback((s: { muted: boolean; volume: number }) => {
    gameRef.current?.setSoundMuted(s.muted);
    gameRef.current?.setSoundVolume(s.volume);
  }, []);

  const onGraphicsChange = useCallback((quality: 'low' | 'medium' | 'high') => {
    gameRef.current?.applySettings({ graphicsQuality: quality });
  }, []);

  const onStart = useCallback(async (id: JetId) => {
    if (phaseRef.current === 'loading') return;
    if (!gameRef.current) {
      console.error('Spiel-Engine nicht bereit');
      setLoadError('Spiel-Engine nicht bereit');
      return;
    }
    if (!isJetOwned(id)) {
      setLoadError('Dieses Flugzeug ist noch nicht freigeschaltet.');
      updatePhase('menu');
      return;
    }

    setLoadError(null);
    updatePhase('loading');
    setLoadingProgress(0);
    setLoadingText('Menü-3D freigeben…');

    // 1) React unmountet Menü/JetPreview (phase=loading → Menus weg)
    // 2) GPU-Preview-Renderer hart freigeben (WebGL-Limit)
    // 3) 2 Frames warten, dann Assets laden
    await waitFrames(2);
    disposePreviewRenderers();
    await waitFrames(2);

    gameRef.current.prepareForGameplay();

    const mapId = mapIdRef.current;
    try {
      setLoadingText('Lade Mission…');
      await gameRef.current.preloadAllAssets(id, mapId, (pct, text) => {
        setLoadingProgress(pct);
        setLoadingText(text);
      });
      gameRef.current.prepareForGameplay();
      // Doppel-Check: State wirklich playing
      if (gameRef.current.getState() !== 'playing') {
        throw new Error('Mission konnte nicht gestartet werden (State=' + gameRef.current.getState() + ')');
      }
      updatePhase('playing');
      // Noch ein Resize nach Sichtbarkeit (opacity 1)
      await waitFrames(1);
      gameRef.current.prepareForGameplay();
    } catch (err) {
      console.error('Fehler beim Laden:', err);
      setLoadError(err instanceof Error ? err.message : 'Unbekannter Ladefehler');
      try {
        gameRef.current.returnToMenu();
      } catch {
        /* ignore */
      }
      updatePhase('menu');
    }
  }, [updatePhase]);

  const onPurchaseJet = useCallback((jetId: string, price: number) => {
    const ok = purchaseJet(jetId, price);
    if (ok) setCredits(loadSettings().aeroCredits);
    return ok;
  }, []);

  const onUnlockAllJets = useCallback(() => {
    // ownedJets wird in Menus geschrieben; Credits/UI hier refreshen
    setCredits(loadSettings().aeroCredits);
  }, []);

  /** Kampagnen-Mission: Level setzen, Map laden, Mission starten */
  const onStartCampaign = useCallback(
    async (levelId: string, jetId: JetId) => {
      if (!gameRef.current) return;
      const level = getCampaignLevel(levelId);
      gameRef.current.setCampaignLevel(level.id);
      mapIdRef.current = level.mapId as MapId;
      try {
        await gameRef.current.selectMap(level.mapId);
      } catch (e) {
        console.warn('Kampagnen-Map laden fehlgeschlagen, starte trotzdem:', e);
      }
      await onStart(jetId);
    },
    [onStart]
  );

  const isMenu = phase === 'menu';
  const isLoading = phase === 'loading';
  const isPlaying = phase === 'playing';
  /** 3D-Welt im Menü und während des Ladens ausblenden */
  const hideGameCanvas = !isPlaying;

  // Overlay-Menüs: Pause/GameOver/Victory ODER Hauptmenü — NIE während reinem Flug
  const showMenus =
    !isLoading &&
    (phase === 'menu' ||
      hud.state === 'paused' ||
      hud.state === 'gameover' ||
      hud.state === 'victory');

  return (
    <div className="liquid-ui-root relative h-screen w-screen overflow-hidden bg-black">
      {isMenu && (
        <div
          className="pointer-events-none fixed inset-0 z-0"
          style={{
            background:
              'radial-gradient(ellipse 70% 60% at 50% 35%, #1a2214 0%, #0e120c 42%, #080a07 100%)',
          }}
          aria-hidden="true"
        >
          <div
            className="absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage:
                'linear-gradient(rgba(201,162,39,0.35) 1px, transparent 1px), linear-gradient(90deg, rgba(201,162,39,0.35) 1px, transparent 1px)',
              backgroundSize: '56px 56px',
            }}
          />
        </div>
      )}

      {/* Loading screen */}
      {isLoading && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6"
          style={{
            background: 'radial-gradient(ellipse 70% 60% at 50% 35%, #1a2214 0%, #080a07 100%)',
          }}
        >
          <div className="ops-load-mark mb-1">Steel Ops · Arming</div>
          <svg
            width="100"
            height="100"
            viewBox="0 0 100 100"
            className="animate-spin"
            style={{ animationDuration: '2.5s' }}
          >
            <defs>
              <linearGradient id="loadGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#6b7a35" />
                <stop offset="100%" stopColor="#c9a227" />
              </linearGradient>
            </defs>
            <rect x="8" y="8" width="84" height="84" fill="none" stroke="rgba(138,148,110,0.2)" strokeWidth="1" />
            <circle
              cx="50"
              cy="50"
              r="38"
              fill="none"
              stroke="rgba(232,230,212,0.08)"
              strokeWidth="2.5"
            />
            <circle
              cx="50"
              cy="50"
              r="38"
              fill="none"
              stroke="url(#loadGrad)"
              strokeWidth="2.5"
              strokeDasharray={`${loadingProgress * 2.39} 239`}
              strokeLinecap="square"
              transform="rotate(-90 50 50)"
              style={{ transition: 'stroke-dasharray 0.4s ease' }}
            />
          </svg>
          <span className="font-mono text-2xl font-bold tabular-nums" style={{ color: '#e8e6d4' }}>
            {loadingProgress}%
          </span>
          <p
            className="animate-pulse text-xs uppercase tracking-[0.22em]"
            style={{ color: 'rgba(201,162,39,0.65)' }}
          >
            {loadingText}
          </p>
          <div
            className="h-1 w-56 overflow-hidden border bg-black/50"
            style={{ borderColor: 'rgba(138,148,110,0.3)' }}
          >
            <div
              className="h-full transition-all duration-500 ease-out"
              style={{
                width: `${loadingProgress}%`,
                background: 'linear-gradient(90deg, #6b7a35, #c9a227, #e4c04a)',
                boxShadow: '0 0 10px rgba(201,162,39,0.4)',
              }}
            />
          </div>
        </div>
      )}

      {/* Load error banner */}
      {loadError && isMenu && (
        <div
          className="pointer-events-auto fixed left-1/2 top-4 z-[60] max-w-md -translate-x-1/2 border border-red-500/40 bg-black/90 px-4 py-3 text-center text-sm text-red-200"
          style={{ borderRadius: 3 }}
        >
          <div className="font-semibold tracking-wide">Start fehlgeschlagen</div>
          <div className="mt-1 text-xs text-white/60">{loadError}</div>
          <button
            type="button"
            className="mt-2 text-xs uppercase tracking-wider text-amber-300 underline"
            onClick={() => setLoadError(null)}
          >
            Schließen
          </button>
        </div>
      )}

      {/* Game canvas: nur im Spiel sichtbar & interaktiv (z-index unter HUD/Menüs) */}
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 h-full w-full ${
          hideGameCanvas ? 'pointer-events-none opacity-0' : 'opacity-100'
        }`}
        style={{
          // Kein transition-opacity — verhindert „weißer Flash“ / verzögertes Einblenden
          transition: 'none',
          zIndex: 0,
          background: '#0a1628',
        }}
      />

      {isPlaying && (
        <div className="pointer-events-none absolute inset-0 z-10">
          <Hud data={hud} />
        </div>
      )}

      {showMenus && (
        <div className="absolute inset-0 z-30">
        <Menus
          state={
            // Nach GameOver setzen wir phase=menu, behalten aber den echten HUD-State
            // für Victory/Shot-Down-Screens. Reines Menü nur wenn Game auch im Menu ist.
            hud.state === 'paused' || hud.state === 'gameover' || hud.state === 'victory'
              ? hud.state
              : 'menu'
          }
          score={hud.score}
          selectedJetId={hud.selectedJetId}
          selectedMapId={hud.selectedMapId}
          onSelectJet={(id: JetId) => {
            // Nur freigeschaltete Jets als Combat-Loadout setzen
            if (!isJetOwned(id)) return;
            void gameRef.current?.selectJet(id);
          }}
          onSelectMap={(id: MapId) => {
            mapIdRef.current = id;
            return gameRef.current?.selectMap(id) ?? Promise.resolve();
          }}
          onStart={onStart}
          onResume={() => gameRef.current?.togglePause()}
          onMenu={() => {
            gameRef.current?.returnToMenu();
            updatePhase('menu');
          }}
          onSoundChange={onSoundChange}
          onGraphicsChange={onGraphicsChange}
          aeroCredits={credits}
          onPurchaseJet={onPurchaseJet}
          onStartCampaign={onStartCampaign}
          onUnlockAllJets={onUnlockAllJets}
        />
        </div>
      )}
    </div>
  );
}
