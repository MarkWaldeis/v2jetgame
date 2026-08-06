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
              'radial-gradient(ellipse 70% 60% at 50% 35%, #0a1628 0%, #080e1a 42%, #020508 100%)',
          }}
          aria-hidden="true"
        >
          <div
            className="absolute inset-0 opacity-[0.035]"
            style={{
              backgroundImage:
                'linear-gradient(rgba(0,242,255,0.35) 1px, transparent 1px), linear-gradient(90deg, rgba(0,242,255,0.35) 1px, transparent 1px)',
              backgroundSize: '64px 64px',
            }}
          />
          <div
            className="absolute left-[12%] top-[8%] h-[50vw] w-[50vw] max-h-[720px] max-w-[720px] rounded-full opacity-[0.09]"
            style={{
              background: 'radial-gradient(circle, #00f2ff 0%, transparent 70%)',
              animation: 'menuGlowPulse 6s ease-in-out infinite',
            }}
          />
          <div
            className="absolute bottom-[15%] right-[8%] h-[42vw] w-[42vw] max-h-[640px] max-w-[640px] rounded-full opacity-[0.06]"
            style={{
              background: 'radial-gradient(circle, #fbbf24 0%, transparent 70%)',
              animation: 'menuGlowPulse 7.5s ease-in-out 1.5s infinite',
            }}
          />
          <div
            className="absolute bottom-0 left-0 right-0 h-[34%]"
            style={{
              background: 'linear-gradient(0deg, rgba(0,242,255,0.05) 0%, transparent 100%)',
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

      {/* Loading screen — unchanged protection against graphics glitches */}
      {isLoading && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6"
          style={{
            background: 'radial-gradient(ellipse 70% 60% at 50% 35%, #0d1f3c 0%, #020810 100%)',
          }}
        >
          <svg
            width="100"
            height="100"
            viewBox="0 0 100 100"
            className="animate-spin"
            style={{ animationDuration: '2.5s' }}
          >
            <defs>
              <linearGradient id="loadGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#0a84ff" />
                <stop offset="100%" stopColor="#00f2ff" />
              </linearGradient>
            </defs>
            <circle
              cx="50"
              cy="50"
              r="42"
              fill="none"
              stroke="rgba(255,255,255,0.06)"
              strokeWidth="2.5"
            />
            <circle
              cx="50"
              cy="50"
              r="42"
              fill="none"
              stroke="url(#loadGrad)"
              strokeWidth="2.5"
              strokeDasharray={`${loadingProgress * 2.64} 264`}
              strokeLinecap="round"
              transform="rotate(-90 50 50)"
              style={{ transition: 'stroke-dasharray 0.4s cubic-bezier(0.4,0,0.2,1)' }}
            />
          </svg>
          <span className="text-2xl font-bold tabular-nums text-white/85">{loadingProgress}%</span>
          <p className="animate-pulse text-xs uppercase tracking-[0.22em] text-white/50">
            {loadingText}
          </p>
          <div className="h-[3px] w-56 overflow-hidden rounded-full bg-white/[0.05]">
            <div
              className="h-full rounded-full transition-all duration-500 ease-out"
              style={{
                width: `${loadingProgress}%`,
                background: 'linear-gradient(90deg, #0a84ff, #00f2ff)',
                boxShadow: '0 0 10px rgba(0,242,255,0.4)',
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
