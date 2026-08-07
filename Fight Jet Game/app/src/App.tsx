import { useCallback, useEffect, useRef, useState } from 'react';
import { Game, type HudData } from './game/Game';
import { Hud } from './components/Hud';
import { Menus } from './components/Menus';
import type { JetId } from './game/aircraft/JetCatalog';
import type { MapId } from './game/world/MapCatalog';
import { loadSettings, saveSettings, purchaseJet } from './lib/gameSettings';

const initialHud: HudData = {
  state: 'menu',
  speedKnots: 0, altitudeFt: 0, headingDeg: 0, throttle: 0.6,
  afterburner: false, stalled: false, freeLook: false, autoTrack: false, gForce: 1,
  hp: 100, maxHp: 100, score: 0, missiles: 6, flares: 0, maxFlares: 0, flareActive: false, enemiesAlive: 4,
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

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const phaseRef = useRef<AppPhase>('menu');
  const [hud, setHud] = useState<HudData>(initialHud);
  const [phase, setPhase] = useState<AppPhase>('menu');
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingText, setLoadingText] = useState('Initialisiere...');
  const [credits, setCredits] = useState(() => loadSettings().aeroCredits);

  const updatePhase = useCallback((next: AppPhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  // TEMP: Credits beim Start nochmal aus Settings laden (Dev-Boost greift auch bei altem localStorage)
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
      // Spiel läuft → Canvas/Phase freigeben
      if (d.state === 'playing') {
        updatePhase('playing');
        return;
      }
      // Mission beendet
      if ((d.state === 'gameover' || d.state === 'victory') && phaseRef.current === 'playing') {
        const reward = d.state === 'victory' ? 1000 : Math.floor(d.score * 0.5);
        const s = loadSettings();
        s.aeroCredits += reward;
        saveSettings(s);
        setCredits(s.aeroCredits);
        updatePhase('menu');
        return;
      }
      // Menü-State vom Game: Ladescreen NICHT abbrechen!
      // Früher: jedes HUD-Tick mit state=menu setzte phase zurück auf 'menu'
      // und hat "Mission starten" sofort wieder zunichte gemacht.
      if (d.state === 'menu') {
        if (phaseRef.current !== 'loading') {
          updatePhase('menu');
        }
        setCredits(loadSettings().aeroCredits);
      }
    });

    // Apply saved sound settings
    const s = loadSettings();
    game.setSoundMuted(s.muted);
    game.setSoundVolume(s.masterVolume);

    return () => game.dispose();
  }, [updatePhase]);

  const onSoundChange = useCallback((s: { muted: boolean; volume: number }) => {
    gameRef.current?.setSoundMuted(s.muted);
    gameRef.current?.setSoundVolume(s.volume);
  }, []);

  const onStart = useCallback(async (id: JetId) => {
    // Doppelklick / mehrfacher Start während Loading ignorieren
    if (phaseRef.current === 'loading') return;
    if (!gameRef.current) {
      console.error('Spiel-Engine nicht bereit');
      return;
    }

    updatePhase('loading');
    setLoadingProgress(0);
    setLoadingText('Initialisiere...');

    const mapId = hud.selectedMapId;
    try {
      await gameRef.current.preloadAllAssets(id, mapId, (pct, text) => {
        setLoadingProgress(pct);
        setLoadingText(text);
      });
      // Sicherstellen, dass wir im Spiel landen (auch wenn HUD schon 'playing' gemeldet hat)
      updatePhase('playing');
    } catch (err) {
      console.error('Fehler beim Laden:', err);
      updatePhase('menu');
    }
  }, [hud.selectedMapId, updatePhase]);

  const onPurchaseJet = useCallback((jetId: string, price: number) => {
    const ok = purchaseJet(jetId, price);
    if (ok) setCredits(loadSettings().aeroCredits);
    return ok;
  }, []);

  const isMenu = phase === 'menu';
  const isLoading = phase === 'loading';
  /** 3D-Welt im Menü und während des Ladens ausblenden (kein Grafik-Glitch, kein Hangar-3D) */
  const hideGameCanvas = isMenu || isLoading;

  return (
    <div className="liquid-ui-root relative h-screen w-screen overflow-hidden bg-black">
      {/*
        Menu-only deep hangar base (full viewport, including under sidebar).
        Detailed hangar layers live inside Menus (content area).
        Canvas stays invisible while in menu — no live 3D world behind UI.
      */}
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
          <div
            className="absolute left-[12%] top-[8%] h-[50vw] w-[50vw] max-h-[720px] max-w-[720px] rounded-full opacity-[0.09]"
            style={{
              background: 'radial-gradient(circle, #c9a227 0%, transparent 70%)',
              animation: 'menuGlowPulse 6s ease-in-out infinite',
            }}
          />
          <div
            className="absolute bottom-[15%] right-[8%] h-[42vw] w-[42vw] max-h-[640px] max-w-[640px] rounded-full opacity-[0.07]"
            style={{
              background: 'radial-gradient(circle, #8fae5a 0%, transparent 70%)',
              animation: 'menuGlowPulse 7.5s ease-in-out 1.5s infinite',
            }}
          />
          <div
            className="absolute bottom-0 left-0 right-0 h-[34%]"
            style={{
              background: 'linear-gradient(0deg, rgba(201,162,39,0.05) 0%, transparent 100%)',
            }}
          />
        </div>
      )}

      <style>{`
        @keyframes menuGlowPulse {
          0%, 100% { opacity: 0.05; transform: scale(1); }
          50% { opacity: 0.11; transform: scale(1.06); }
        }
      `}</style>

      {/* Loading screen — Steel Ops briefing style */}
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
            <line x1="50" y1="18" x2="50" y2="28" stroke="#c9a227" strokeWidth="1.5" opacity="0.7" />
            <line x1="50" y1="72" x2="50" y2="82" stroke="#c9a227" strokeWidth="1.5" opacity="0.7" />
            <line x1="18" y1="50" x2="28" y2="50" stroke="#c9a227" strokeWidth="1.5" opacity="0.7" />
            <line x1="72" y1="50" x2="82" y2="50" stroke="#c9a227" strokeWidth="1.5" opacity="0.7" />
          </svg>
          <span className="font-mono text-2xl font-bold tabular-nums" style={{ color: '#e8e6d4' }}>{loadingProgress}%</span>
          <p className="animate-pulse text-xs uppercase tracking-[0.22em]" style={{ color: 'rgba(201,162,39,0.65)' }}>
            {loadingText}
          </p>
          <div className="h-1 w-56 overflow-hidden border bg-black/50" style={{ borderColor: 'rgba(138,148,110,0.3)' }}>
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

      {/* Game canvas: invisible in menu/loading, fully interactive while playing */}
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 h-full w-full transition-opacity duration-500 ${
          hideGameCanvas ? 'pointer-events-none opacity-0' : 'opacity-100'
        }`}
      />

      <Hud data={hud} />

      {phase !== 'loading' && (
        <Menus
          state={hud.state}
          score={hud.score}
          selectedJetId={hud.selectedJetId}
          selectedMapId={hud.selectedMapId}
          onSelectJet={(id: JetId) => {
            void gameRef.current?.selectJet(id);
          }}
          onSelectMap={(id: MapId) => gameRef.current?.selectMap(id) ?? Promise.resolve()}
          onStart={onStart}
          onResume={() => gameRef.current?.togglePause()}
          onMenu={() => gameRef.current?.returnToMenu()}
          onSoundChange={onSoundChange}
          aeroCredits={credits}
          onPurchaseJet={onPurchaseJet}
        />
      )}
    </div>
  );
}
