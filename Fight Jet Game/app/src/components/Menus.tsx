import { useEffect, useRef, useState } from 'react';
import type { GameState } from '../game/Game';
import {
  JET_CATALOG,
  FACTION_LABELS,
  jetsSortedByPrice,
  type JetFaction,
  type JetId,
} from '../game/aircraft/JetCatalog';
import {
  loadSettings,
  saveSettings,
  isJetOwned,
  jetStatBars,
  type GameSettings,
  type GraphicsQuality,
} from '../lib/gameSettings';
import { MAP_CATALOG, getMapDef, type MapId } from '../game/world/MapCatalog';
import { JetSilhouette, NavIcon } from './JetIcons';
import { JetPreview3D } from './JetPreview3D';
import { JetThumb } from './JetThumb';
import { warmJetThumbnails } from '../lib/jetThumbnails';

type Screen = 'main' | 'hangar' | 'maps' | 'missions' | 'settings';
type SettingsTab = 'graphics' | 'sound' | 'controls';

const CONTROLS: { key: string; label: string }[] = [
  { key: 'Maus', label: 'Mouse-Aim (Fly-By-Wire)' },
  { key: 'S / W', label: 'Ziehen / Drücken' },
  { key: 'A / D', label: 'Rollen (eigene Achse)' },
  { key: 'Q / E', label: 'Seitenruder' },
  { key: 'Shift · Ctrl · Rad', label: 'Schub / WEP' },
  { key: 'B', label: 'Luftbremse' },
  { key: 'Leertaste', label: 'Bordkanone' },
  { key: 'R', label: 'Nachladen' },
  { key: 'F / M', label: 'Rakete (nach Lock)' },
  { key: 'X / Z', label: 'Flares (Gegenmaßnahmen, 50/50)' },
  { key: 'C / RMB', label: 'Free-Look (halten)' },
  { key: 'V', label: 'Cockpit / Chase' },
  { key: 'P / Esc', label: 'Pause' },
];

function StatBar({ label, value }: { label: string; value: number }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="mb-3">
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="tracking-[0.14em] text-white/55 uppercase">{label}</span>
        <span className="glass-mono text-white/80">{v}</span>
      </div>
      <div className="glass-progress-track">
        <div className="glass-progress-fill" style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}

export function Menus({
  state,
  score,
  selectedJetId,
  selectedMapId,
  onSelectJet,
  onSelectMap,
  onStart,
  onResume,
  onMenu,
  onSoundChange,
  aeroCredits,
  onPurchaseJet,
}: {
  state: GameState;
  score: number;
  selectedJetId: JetId;
  selectedMapId: MapId;
  onSelectJet: (id: JetId) => void;
  onSelectMap: (id: MapId) => void | Promise<void>;
  onStart: (jetId: JetId) => void;
  onResume: () => void;
  onMenu: () => void;
  onSoundChange?: (s: { muted: boolean; volume: number }) => void;
  aeroCredits: number;
  onPurchaseJet: (jetId: string, price: number) => boolean;
}) {
  const [screen, setScreen] = useState<Screen>('main');
  const [faction, setFaction] = useState<JetFaction>('nato');
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('graphics');
  const [settings, setSettings] = useState<GameSettings>(() => loadSettings());
  const [exitConfirm, setExitConfirm] = useState(false);
  const [mapLoading, setMapLoading] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [hangarCanScrollLeft, setHangarCanScrollLeft] = useState(false);
  const [hangarCanScrollRight, setHangarCanScrollRight] = useState(false);
  /** Verhindert Reset auf 'main' wenn z.B. aus GameOver absichtlich Garage geöffnet wird */
  const preserveScreenRef = useRef(false);
  const prevStateRef = useRef<GameState>(state);
  const hangarScrollRef = useRef<HTMLDivElement>(null);

  const selected = JET_CATALOG.find((j) => j.id === selectedJetId) ?? JET_CATALOG[0];
  const selectedMap = getMapDef(selectedMapId);
  const sortedJets = jetsSortedByPrice();
  const bars = jetStatBars(selected.stats);
  const mapKm = selectedMap ? (selectedMap.worldSizeM / 1000).toFixed(0) : '—';

  const pickMap = async (id: MapId) => {
    setMapError(null);
    setMapLoading(true);
    try {
      await onSelectMap(id);
    } catch (e) {
      setMapError(e instanceof Error ? e.message : 'Map konnte nicht geladen werden');
    } finally {
      setMapLoading(false);
    }
  };

  useEffect(() => {
    saveSettings(settings);
    onSoundChange?.({ muted: settings.muted, volume: settings.masterVolume });
  }, [settings, onSoundChange]);

  // Nur beim echten Wechsel ZURÜCK ins Menü auf Home springen — nicht bei jedem Render
  useEffect(() => {
    const prev = prevStateRef.current;
    prevStateRef.current = state;
    if (state === 'menu' && prev !== 'menu') {
      if (preserveScreenRef.current) {
        preserveScreenRef.current = false;
      } else {
        setScreen('main');
      }
    }
  }, [state]);

  /** Hangar-Jet-Leiste: Scroll-Pfeile aktiv/inaktiv */
  const updateHangarScrollState = () => {
    const el = hangarScrollRef.current;
    if (!el) {
      setHangarCanScrollLeft(false);
      setHangarCanScrollRight(false);
      return;
    }
    const max = el.scrollWidth - el.clientWidth;
    setHangarCanScrollLeft(el.scrollLeft > 4);
    setHangarCanScrollRight(max > 4 && el.scrollLeft < max - 4);
  };

  const scrollHangar = (dir: -1 | 1) => {
    const el = hangarScrollRef.current;
    if (!el) return;
    const step = Math.max(240, Math.floor(el.clientWidth * 0.7));
    el.scrollBy({ left: dir * step, behavior: 'smooth' });
  };

  useEffect(() => {
    if (screen !== 'hangar') return;
    const el = hangarScrollRef.current;
    if (!el) return;

    // Faction-Wechsel: an den Anfang der Leiste
    el.scrollLeft = 0;

    // Nach Faction-Wechsel Layout neu messen
    const measure = () => updateHangarScrollState();
    measure();
    const t = window.setTimeout(measure, 50);

    el.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);

    // Mausrad vertikal → horizontal scrollen (sonst kommt man oft nicht zum letzten Jet)
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth + 2) return;
      // Nur umlenken, wenn horizontaler Overflow da ist
      if (Math.abs(e.deltaY) >= Math.abs(e.deltaX)) {
        e.preventDefault();
        el.scrollLeft += e.deltaY + e.deltaX;
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      window.clearTimeout(t);
      el.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
      el.removeEventListener('wheel', onWheel);
    };
  }, [screen, faction]);

  // Hangar-Karten: GLB-Thumbnails vorwärmen (Faction zuerst)
  useEffect(() => {
    if (screen !== 'hangar' && screen !== 'main') return;
    const all = jetsSortedByPrice();
    const factionIds = all.filter((j) => j.faction === faction).map((j) => j.id);
    const rest = all.filter((j) => j.faction !== faction).map((j) => j.id);
    void warmJetThumbnails([...factionIds, ...rest]);
  }, [screen, faction]);

  if (state === 'playing') return null;

  const patchSettings = (partial: Partial<GameSettings>) =>
    setSettings((s) => ({ ...s, ...partial }));

  /** Zentrale Navigation — alle Sidebar/Quick-Link Buttons laufen hierüber */
  const navigateTo = (next: Screen) => {
    setExitConfirm(false);
    if (next === 'hangar') {
      setFaction(selected.faction);
    }
    setScreen(next);
  };

  const openHangar = () => navigateTo('hangar');

  const tryExit = () => {
    setExitConfirm(true);
  };

  const confirmExit = () => {
    setExitConfirm(false);
    setScreen('main');
    if (state !== 'menu') onMenu();
  };

  const startMission = () => {
    if (!isJetOwned(selectedJetId)) {
      openHangar();
      return;
    }
    onStart(selectedJetId);
  };

  // ─── Sidebar Navigation ─────────────────────────────────────────────────
  const NAV_ITEMS: {
    screen: Screen;
    icon: 'home' | 'hangar' | 'campaign' | 'maps' | 'settings';
    label: string;
  }[] = [
    { screen: 'main', icon: 'home', label: 'Kommando' },
    { screen: 'hangar', icon: 'hangar', label: 'Hangar' },
    { screen: 'missions', icon: 'campaign', label: 'Kampagne' },
    { screen: 'maps', icon: 'maps', label: 'Einsatzgebiet' },
    { screen: 'settings', icon: 'settings', label: 'Systeme' },
  ];

  // ─── Hangar Atmosphere Background ──────────────────────────────────────
  const HangarBackground = () => (
    <div className="hangar-bg" aria-hidden="true">
      <div className="hangar-bg-base" />
      <div className="hangar-spot-left" />
      <div className="hangar-spot-right" />
      <div className="hangar-spot-center" />
      <div className="hangar-floor" />
      <div className="hangar-grid" />
      <div className="hangar-haze" />
      <div className="hangar-beams" />
      <div className="hangar-silhouette">
        <span className="hangar-silhouette-text" key={selected.id}>
          {selected.name}
        </span>
      </div>
      <div className="hangar-particles">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="hangar-particle" />
        ))}
      </div>
      <div className="hangar-vignette" />
    </div>
  );

  // ─── Credits Badge ──────────────────────────────────────────────────────
  const CreditsBadge = ({ compact = false }: { compact?: boolean }) => (
    <div
      className={`ops-credits pointer-events-auto flex items-center gap-2.5 border shadow-[0_6px_20px_rgba(0,0,0,0.45)] ${
        compact ? 'px-3 py-1.5' : 'px-4 py-2'
      }`}
      title="Aero Credits"
    >
      <div className={`relative shrink-0 ${compact ? 'h-6 w-6' : 'h-7 w-7'}`}>
        <img
          src="./aero_credits.jpg"
          alt="Aero Credits"
          className="h-full w-full object-cover border border-amber-600/40"
          style={{ animation: 'coin-spin 3s linear infinite', borderRadius: 2 }}
        />
      </div>
      <div className="flex flex-col leading-tight">
        <span className="font-display text-xs font-bold tabular-nums tracking-[0.08em] text-amber-100">
          {aeroCredits.toLocaleString()}
        </span>
        <span className="text-[9px] uppercase tracking-[0.16em] text-amber-300/55">Aero Credits</span>
      </div>
    </div>
  );

  // ─── Top Bar (War Thunder: To Battle oben) ──────────────────────────────
  const TopBar = () => (
    <div className="topbar">
      <button
        type="button"
        className="topbar-start topbar-start--primary"
        onClick={startMission}
        title="Mission starten"
      >
        <span className="topbar-start-icon">
          <NavIcon name="launch" />
        </span>
        <span>TO BATTLE</span>
      </button>

      <button type="button" className="topbar-chip" onClick={() => navigateTo('maps')} title="Map wählen">
        <span className="topbar-chip-icon">
          <NavIcon name="map" />
        </span>
        <div className="min-w-0 text-left">
          <div className="topbar-chip-label">Map wählen</div>
          <div className="topbar-chip-value truncate">{selectedMap?.name ?? selectedMapId}</div>
          <div className="topbar-chip-sub">{mapKm} × {mapKm} km</div>
        </div>
      </button>

      {screen !== 'main' && (
        <button type="button" className="topbar-chip" onClick={openHangar} title="Hangar">
          <span className="topbar-chip-icon">
            <JetSilhouette jetId={selected.id} faction={selected.faction} size="sm" />
          </span>
          <div className="min-w-0 text-left">
            <div className="topbar-chip-label">Airframe</div>
            <div className="topbar-chip-value truncate">{selected.name}</div>
            <div className="topbar-chip-sub truncate">{selected.callsign}</div>
          </div>
        </button>
      )}

      <div className="topbar-spacer" />
      <CreditsBadge compact />
    </div>
  );

  // ─── Exit confirm (fixed full-screen so Sidebar darunter nicht blockiert) ─
  const ExitModal = () =>
    exitConfirm ? (
      <div className="pointer-events-auto fixed inset-0 z-[100] flex items-center justify-center bg-black/70">
        <div className="glass-panel mx-4 w-full max-w-md p-6 text-center">
          <div className="glass-eyebrow mb-2">Command Link</div>
          <h3 className="glass-title mb-2 text-2xl">Sitzung trennen?</h3>
          <p className="glass-subtitle mb-6 text-sm">
            Rückkehr zum Kommando. Fortschritt der laufenden Mission geht verloren.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            <button
              type="button"
              className="glass-button glass-button-ghost"
              onClick={() => setExitConfirm(false)}
            >
              Abbrechen
            </button>
            <button type="button" className="glass-button glass-button-danger" onClick={confirmExit}>
              Trennen
            </button>
          </div>
        </div>
      </div>
    ) : null;

  // ─── Settings content (shared pause + menu) ─────────────────────────────
  const SettingsBody = () => (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        {(
          [
            ['graphics', 'Grafik'],
            ['sound', 'Sound'],
            ['controls', 'Steuerung'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`glass-button ${settingsTab === id ? 'glass-button-primary' : 'glass-button-ghost'} !px-4 !py-2 !text-xs`}
            onClick={() => setSettingsTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {settingsTab === 'graphics' && (
        <div className="space-y-5">
          <div>
            <div className="mb-2 text-xs tracking-[0.16em] text-white/50 uppercase">Qualität</div>
            <div className="flex flex-wrap gap-2">
              {(['low', 'medium', 'high'] as GraphicsQuality[]).map((q) => (
                <button
                  key={q}
                  type="button"
                  className={`glass-button !px-4 !py-2 !text-xs ${
                    settings.graphicsQuality === q ? 'glass-button-primary' : 'glass-button-ghost'
                  }`}
                  onClick={() => patchSettings({ graphicsQuality: q })}
                >
                  {q === 'low' ? 'Niedrig' : q === 'medium' ? 'Mittel' : 'Hoch'}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-white/40">
              Hoch empfiehlt sich für Desktop. Einstellungen werden lokal gespeichert.
            </p>
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-white">Flug-HUD anzeigen</div>
              <div className="text-xs text-white/45">Speed, Radar, Reticle & Status</div>
            </div>
            <button
              type="button"
              className={`glass-toggle ${settings.showHud ? 'is-on' : ''}`}
              aria-label="HUD umschalten"
              onClick={() => patchSettings({ showHud: !settings.showHud })}
            />
          </div>
        </div>
      )}

      {settingsTab === 'sound' && (
        <div className="space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-white">Stumm</div>
              <div className="text-xs text-white/45">Triebwerk, Waffen, Warner</div>
            </div>
            <button
              type="button"
              className={`glass-toggle ${settings.muted ? 'is-on' : ''}`}
              aria-label="Stumm umschalten"
              onClick={() => patchSettings({ muted: !settings.muted })}
            />
          </div>
          <div>
            <div className="mb-2 flex justify-between text-xs tracking-[0.12em] text-white/50 uppercase">
              <span>Master-Lautstärke</span>
              <span className="glass-mono text-white/80">{Math.round(settings.masterVolume * 100)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(settings.masterVolume * 100)}
              className="glass-slider"
              disabled={settings.muted}
              onChange={(e) => patchSettings({ masterVolume: Number(e.target.value) / 100 })}
            />
          </div>
        </div>
      )}

      {settingsTab === 'controls' && (
        <div className="glass-scroll max-h-[42vh] space-y-2 overflow-y-auto pr-1">
          {CONTROLS.map((c) => (
            <div
              key={c.key}
              className="flex items-center justify-between gap-3 border border-[rgba(138,148,110,0.22)] bg-black/30 px-3 py-2.5"
              style={{ borderRadius: 3 }}
            >
              <span className="glass-mono border border-[rgba(201,162,39,0.4)] bg-[rgba(201,162,39,0.1)] px-2.5 py-0.5 text-xs text-amber-200">
                {c.key}
              </span>
              <span className="text-right text-sm text-white/70">{c.label}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );

  // ─── PAUSE ──────────────────────────────────────────────────────────────
  if (state === 'paused') {
    return (
      <div className="absolute inset-0 z-20 flex items-center justify-center">
        <div className="menu-vignette absolute inset-0" />
        <div className="glass-panel pointer-events-auto relative z-10 mx-4 w-full max-w-lg p-6 sm:p-8">
          <div className="glass-eyebrow mb-2">Hold Pattern</div>
          <h2 className="glass-title mb-1 text-4xl text-white">Pause</h2>
          <p className="glass-subtitle mb-1 text-sm">
            {selected.name} · <span className="text-amber-300/90">{selected.callsign}</span>
          </p>
          <p className="mb-5 glass-mono text-sm text-white/50">
            Score <span className="text-white">{score}</span>
          </p>
          <SettingsBody />
          <div className="mt-6 flex flex-col gap-2">
            <button type="button" className="glass-button glass-button-primary w-full py-3.5" onClick={onResume}>
              Weiterfliegen (P)
            </button>
            <button
              type="button"
              className="glass-button glass-button-ghost w-full"
              onClick={() => {
                onMenu();
                setScreen('main');
              }}
            >
              Zum Kommando
            </button>
          </div>
        </div>
        <ExitModal />
      </div>
    );
  }

  // ─── GAME OVER / VICTORY ────────────────────────────────────────────────
  if (state === 'gameover' || state === 'victory') {
    const win = state === 'victory';
    return (
      <div className="absolute inset-0 z-20 flex items-center justify-center">
        <div className="menu-vignette absolute inset-0" />
        <div className="glass-panel pointer-events-auto relative z-10 mx-4 w-full max-w-md p-8 text-center">
          <div
            className="glass-eyebrow mb-2"
            style={{ color: win ? 'var(--accent-success)' : 'var(--accent-danger)' }}
          >
            {win ? 'Alle Wellen abgeschlossen' : 'Airframe lost'}
          </div>
          <h2 className="glass-title mb-2 text-4xl" style={{ color: win ? '#fff' : 'var(--accent-danger)' }}>
            {win ? 'Mission erfüllt' : 'Shot Down'}
          </h2>
          <p className="glass-subtitle mb-1 text-sm">
            {win ? `Der Himmel gehört ${selected.callsign}.` : `${selected.callsign} ist abgestürzt.`}
          </p>
          <p className="mb-6 text-2xl font-bold">
            Score <span className="glass-mono text-amber-300">{score}</span>
          </p>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              className="glass-button glass-button-primary w-full py-3.5"
              onClick={startMission}
            >
              {win ? 'Neue Mission' : 'Erneut fliegen'} (Enter)
            </button>
            <button
              type="button"
              className="glass-button glass-button-ghost w-full"
              onClick={() => {
                preserveScreenRef.current = true;
                setScreen('hangar');
                setFaction(selected.faction);
                onMenu();
              }}
            >
              Hangar öffnen
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── MENU states ────────────────────────────────────────────────────────
  // Flex-Shell: Sidebar ist Teil des Layouts (nicht nur fixed) → Klicks greifen zuverlässig
  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex">
      {/* ── LEFT SIDEBAR ─────────────────────────────────────────────────── */}
      <aside className="glass-sidebar pointer-events-auto relative z-50 flex h-full w-[232px] shrink-0 flex-col">
        <div className="flex items-center gap-3 border-b border-[rgba(138,148,110,0.18)] px-4 py-4">
          <div className="glass-sidebar-logo">FJ</div>
          <div>
            <div className="font-display text-[13px] font-bold leading-tight tracking-[0.12em] text-[#f0ecd8]">
              FIGHT JET 3D
            </div>
            <div className="text-[8px] uppercase tracking-[0.16em] text-[rgba(201,162,39,0.55)]">
              Steel Ops Command
            </div>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 px-3 py-3" aria-label="Hauptnavigation">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.screen}
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                navigateTo(item.screen);
              }}
              className={`glass-sidebar-btn ${screen === item.screen ? 'is-active' : ''}`}
              aria-current={screen === item.screen ? 'page' : undefined}
            >
              <span className="sidebar-btn-icon" aria-hidden="true">
                <NavIcon name={item.icon} />
              </span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="border-t border-[rgba(138,148,110,0.18)] px-3 py-2.5">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              tryExit();
            }}
            className="glass-sidebar-exit"
          >
            <span className="sidebar-btn-icon" aria-hidden="true">
              <NavIcon name="exit" />
            </span>
            <span>Beenden</span>
          </button>
        </div>
      </aside>

      {/* ── MAIN COLUMN (TopBar + Content) ───────────────────────────────── */}
      <div className="relative flex min-w-0 flex-1 flex-col">
        <div className="pointer-events-auto relative z-40 shrink-0">
          <TopBar />
        </div>

        <div className="relative min-h-0 flex-1 overflow-hidden">
          <HangarBackground />

        {/* ═══════════════ MAIN COMMAND — 3D jet hero (WT style) ═══════════════ */}
        {screen === 'main' && (
          <div className="cmd-stage absolute inset-0">
            <div className="cmd-stage-3d pointer-events-auto">
              <JetPreview3D
                key={`hero-${selectedJetId}`}
                jetId={selectedJetId}
                mode="hero"
                autoRotate
                interactive
              />
            </div>

            <div className="cmd-stage-vignette pointer-events-none" />

            {/* Brand watermark — not blocking center */}
            <div className="cmd-brand pointer-events-none">
              <div className="ops-status-chip">
                <span className="ops-status-dot" />
                Combat Ready
              </div>
              <div className="cmd-brand-title">
                FIGHT JET <span className="main-title-gradient">3D</span>
              </div>
            </div>

            {/* Bottom HUD strip — few actions only */}
            <div className="cmd-bottom pointer-events-none">
              <button
                type="button"
                className="cmd-plate pointer-events-auto"
                onClick={openHangar}
                title="Hangar öffnen"
              >
                <div className="cmd-plate-thumb">
                  <JetThumb jetId={selected.id} faction={selected.faction} />
                </div>
                <div className="min-w-0 text-left">
                  <div className="cmd-plate-label">Airframe · Hangar</div>
                  <div className="cmd-plate-name truncate">{selected.name}</div>
                  <div className="cmd-plate-sub truncate">
                    {selected.callsign} · {FACTION_LABELS[selected.faction]}
                  </div>
                </div>
              </button>

              <button
                type="button"
                className="cmd-plate pointer-events-auto"
                onClick={() => navigateTo('maps')}
                title="Map wählen"
              >
                <div className="cmd-plate-icon">
                  <NavIcon name="map" />
                </div>
                <div className="min-w-0 text-left">
                  <div className="cmd-plate-label">Map wählen</div>
                  <div className="cmd-plate-name truncate">{selectedMap?.name ?? selectedMapId}</div>
                  <div className="cmd-plate-sub">
                    {mapKm} × {mapKm} km
                  </div>
                </div>
              </button>
            </div>

            <p className="cmd-hint pointer-events-none">
              Jet drehen · Scroll zoom · Navigation über Sidebar
            </p>
          </div>
        )}

        {/* ═══════════════ HANGAR — WT vehicle select ═══════════════ */}
        {screen === 'hangar' && (
          <div className="hangar-stage absolute inset-0 flex flex-col">
            {/* Header */}
            <div className="hangar-stage-header pointer-events-auto shrink-0">
              <div>
                <div className="glass-eyebrow">Hangar Bay</div>
                <h2 className="glass-title text-2xl text-white sm:text-3xl">Fleet Select</h2>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {(['nato', 'russia'] as JetFaction[]).map((f) => (
                  <button
                    key={f}
                    type="button"
                    className={`glass-pill px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] ${
                      faction === f
                        ? 'border-[rgba(201,162,39,0.55)] bg-[rgba(201,162,39,0.14)] text-[#f0ecd8]'
                        : 'bg-black/30 text-white/50 hover:text-white/80'
                    }`}
                    onClick={() => {
                      setFaction(f);
                      // Vorschau auf ersten freigeschalteten Jet der Fraktion
                      const pick =
                        sortedJets.find((j) => j.faction === f && isJetOwned(j.id)) ??
                        sortedJets.find((j) => j.faction === f);
                      if (pick && isJetOwned(pick.id)) onSelectJet(pick.id);
                    }}
                  >
                    {FACTION_LABELS[f]}
                  </button>
                ))}
                <button
                  type="button"
                  className="glass-button glass-button-ghost !px-3 !py-1.5 !text-xs"
                  onClick={() => navigateTo('main')}
                >
                  ← Kommando
                </button>
              </div>
            </div>

            {/* Main: 3D + info */}
            <div className="hangar-stage-body min-h-0 flex-1">
              <div className="hangar-stage-3d pointer-events-auto">
                <JetPreview3D
                  key={`hangar-${selectedJetId}`}
                  jetId={selectedJetId}
                  mode="hangar"
                  autoRotate
                  interactive
                />
              </div>

              <aside className="hangar-stage-info pointer-events-auto glass-panel">
                <div className="mb-2 flex flex-wrap items-baseline gap-2">
                  <div className="font-display text-xl font-bold tracking-wide text-[#f0ecd8]">
                    {selected.name}
                  </div>
                  <div
                    className="text-[10px] uppercase tracking-wider"
                    style={{ color: selected.faction === 'nato' ? 'var(--nato)' : 'var(--russia)' }}
                  >
                    {FACTION_LABELS[selected.faction]}
                  </div>
                </div>
                <div className="mb-2 text-sm text-amber-200/80">{selected.callsign}</div>
                <p className="mb-3 text-sm text-white/60">{selected.description}</p>
                <p className="mb-4 text-xs text-amber-100/75">
                  <span className="font-semibold text-amber-300">{selected.special.label}</span>
                  {' — '}
                  {selected.special.detail}
                </p>
                <StatBar label="Geschwindigkeit" value={bars.speed} />
                <StatBar label="Manövrierfähigkeit" value={bars.maneuver} />
                <StatBar label="Panzerung" value={bars.armor} />
                <StatBar label="Bewaffnung" value={bars.weapons} />
                <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-white/45">
                  <div>
                    HP <span className="glass-mono text-white">{selected.stats.hp}</span>
                  </div>
                  <div>
                    Raketen{' '}
                    <span className="glass-mono text-white">
                      {selected.stats.missiles > 0 ? selected.stats.missiles : '—'}
                    </span>
                  </div>
                  <div>
                    Kanone{' '}
                    <span className="glass-mono text-white">
                      {selected.stats.cannonDamage} dmg
                    </span>
                  </div>
                  <div>
                    Lock{' '}
                    <span className="glass-mono text-white">
                      {selected.stats.lockRange > 0 ? `${selected.stats.lockRange} m` : '—'}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  className={`mt-4 w-full py-3.5 text-sm font-bold uppercase tracking-[0.12em] ${
                    isJetOwned(selectedJetId)
                      ? 'glass-button glass-button-primary'
                      : 'cursor-not-allowed border border-white/10 bg-black/40 text-white/25'
                  }`}
                  style={{ borderRadius: 3 }}
                  disabled={!isJetOwned(selectedJetId)}
                  onClick={startMission}
                >
                  {isJetOwned(selectedJetId)
                    ? `TO BATTLE · ${selected.callsign}`
                    : 'GESPERRT'}
                </button>
              </aside>
            </div>

            {/* Bottom vehicle strip — WT style cards with real jet renders */}
            <div className="hangar-stage-strip pointer-events-auto shrink-0">
              <button
                type="button"
                className={`hangar-scroll-btn hangar-scroll-btn-left ${hangarCanScrollLeft ? 'is-visible' : ''}`}
                aria-label="Links"
                disabled={!hangarCanScrollLeft}
                onClick={() => scrollHangar(-1)}
              >
                ‹
              </button>
              <button
                type="button"
                className={`hangar-scroll-btn hangar-scroll-btn-right ${hangarCanScrollRight ? 'is-visible' : ''}`}
                aria-label="Rechts"
                disabled={!hangarCanScrollRight}
                onClick={() => scrollHangar(1)}
              >
                ›
              </button>

              <div
                ref={hangarScrollRef}
                className="hangar-scroll-container hangar-scroll-container--wt"
                onScroll={updateHangarScrollState}
              >
                {sortedJets
                  .filter((j) => j.faction === faction)
                  .map((jet) => {
                    const active = jet.id === selectedJetId;
                    const owned = isJetOwned(jet.id);
                    const locked = !owned && jet.price > 0;
                    const canAfford = aeroCredits >= jet.price;
                    return (
                      <div
                        key={jet.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          // Auch gesperrte Jets anschauen (kaufen separat)
                          onSelectJet(jet.id);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') onSelectJet(jet.id);
                        }}
                        className={`wt-jet-card ${active ? 'is-selected' : ''} ${locked ? 'is-locked' : ''}`}
                      >
                        <div
                          className={`wt-jet-card-stripe ${
                            jet.faction === 'nato' ? 'ops-faction-stripe-nato' : 'ops-faction-stripe-russia'
                          }`}
                        />
                        <JetThumb jetId={jet.id} faction={jet.faction} locked={locked} />
                        <div className="wt-jet-card-body">
                          <div className="wt-jet-card-name">{jet.name}</div>
                          <div className="wt-jet-card-role">{jet.role}</div>
                          {locked ? (
                            <button
                              type="button"
                              className={`wt-jet-card-buy ${canAfford ? 'can-buy' : ''}`}
                              disabled={!canAfford}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!canAfford) return;
                                const ok = onPurchaseJet(jet.id, jet.price);
                                if (ok) onSelectJet(jet.id);
                              }}
                            >
                              <img src="./aero_credits.jpg" alt="" className="h-3.5 w-3.5 object-cover" />
                              {jet.price.toLocaleString()}
                            </button>
                          ) : (
                            <div className={`wt-jet-card-status ${active ? 'is-active' : ''}`}>
                              {active ? 'SELECTED' : 'READY'}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                <div className="hangar-scroll-end-pad" aria-hidden="true" />
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════ MAPS ═══════════════ */}
        {screen === 'maps' && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-y-auto px-4 py-6">
            <div className="glass-panel pointer-events-auto w-full max-w-3xl p-6 sm:p-8">
              <div className="mb-1 flex items-center justify-between">
                <div className="glass-eyebrow">Operations Area</div>
                <button
                  type="button"
                  className="glass-button glass-button-ghost !px-3 !py-1.5 !text-xs"
                  onClick={() => navigateTo('main')}
                >
                  ← Zurück
                </button>
              </div>
              <h2 className="glass-title mb-1 text-3xl">Map wählen</h2>
              <p className="glass-subtitle mb-4 text-sm">
                Große Einsatzgebiete — prozedural oder 3D-Assets (nur Maps mit großer Fläche).
              </p>

              {mapLoading && (
                <div className="mb-4 border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm text-amber-100" style={{ borderRadius: 3 }}>
                  Theater wird geladen und skaliert…
                </div>
              )}
              {mapError && (
                <div className="mb-4 border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-200" style={{ borderRadius: 3 }}>
                  {mapError}
                </div>
              )}

              <div className="mb-5 grid gap-3 sm:grid-cols-2">
                {MAP_CATALOG.map((m) => {
                  const active = m.id === selectedMapId;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      disabled={mapLoading}
                      onClick={() => void pickMap(m.id)}
                      className={`glass-card text-left ${active ? 'is-selected' : ''}`}
                    >
                      <div className="text-[10px] uppercase tracking-[0.18em] text-amber-300/80">
                        {m.subtitle}
                      </div>
                      <div className="mt-1 font-display font-bold leading-tight tracking-wide text-[#f0ecd8]">
                        {m.name}
                      </div>
                      <div className="mt-1 glass-mono text-xs text-white/45">
                        {(m.worldSizeM / 1000).toFixed(0)} km Welt
                        {m.kind === 'glb' ? ` · ~${(m.targetSpanM / 1000).toFixed(0)} km Asset` : ''}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {m.tags.map((t) => (
                          <span
                            key={t}
                            className="border border-[rgba(138,148,110,0.3)] bg-black/30 px-2 py-0.5 text-[10px] text-amber-100/80"
                            style={{ borderRadius: 2 }}
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                      <p className="mt-2 text-[11px] leading-snug text-white/50">{m.description}</p>
                      {active && (
                        <div className="mt-2 text-[10px] font-bold uppercase tracking-[0.2em] text-amber-300">
                          Aktiv
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="ops-detail-panel">
                <div className="text-xs uppercase tracking-[0.16em] text-white/45">Ausgewählt</div>
                <div className="mt-1 font-display text-lg font-bold tracking-wide text-[#f0ecd8]">
                  {selectedMap.name}
                </div>
                <p className="mt-1 text-sm text-white/60">{selectedMap.description}</p>
              </div>

              <button
                type="button"
                className="glass-button glass-button-primary mt-4 w-full py-3.5"
                disabled={mapLoading}
                onClick={startMission}
              >
                Mit dieser Map abheben
              </button>
            </div>
          </div>
        )}

        {/* ═══════════════ MISSIONS ═══════════════ */}
        {screen === 'missions' && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-y-auto px-4 py-6">
            <div className="glass-panel pointer-events-auto w-full max-w-3xl p-6 sm:p-8">
              <div className="mb-1 flex items-center justify-between">
                <div className="glass-eyebrow">Einsätze</div>
                <button
                  type="button"
                  className="glass-button glass-button-ghost !px-3 !py-1.5 !text-xs"
                  onClick={() => navigateTo('main')}
                >
                  ← Zurück
                </button>
              </div>
              <h2 className="glass-title mb-1 text-3xl">Kampagne</h2>
              <p className="glass-subtitle mb-6 text-sm">
                Wähle deine Mission. Weitere Einsätze werden in zukünftigen Updates freigeschaltet.
              </p>

              <div className="mb-6 grid gap-4 sm:grid-cols-2">
                <div className="mission-card is-playable" onClick={startMission}>
                  <div className="mission-card-nr">01</div>
                  <div className="mission-card-name">OPERATION DESERT STORM</div>
                  <p className="mission-card-desc">
                    Eliminiere feindliche Bodentruppen in der Wüstenregion. Weiche SAM-Raketen aus und
                    zerstöre das gegnerische Hauptquartier.
                  </p>
                  <div className="mission-difficulty">
                    Schwierigkeit: <span className="mission-star">★★</span>
                    <span className="mission-star-empty">☆☆☆</span>
                  </div>
                  <span className="mission-card-badge ready">🔓 Bereit</span>
                </div>

                <div className="mission-card is-locked">
                  <div className="mission-card-nr">02</div>
                  <div className="mission-card-name">CANYON RUN</div>
                  <p className="mission-card-desc">
                    Navigiere durch enge Canyons und weiche Radarfallen aus. Tiefflug-Mission bei Nacht.
                  </p>
                  <div className="mission-difficulty">
                    Schwierigkeit:{' '}
                    <span className="mission-star" style={{ opacity: 0.5 }}>
                      ★★★
                    </span>
                    <span className="mission-star-empty">☆☆</span>
                  </div>
                  <span className="mission-card-badge locked-badge">🔒 Demnächst</span>
                </div>

                <div className="mission-card is-locked">
                  <div className="mission-card-nr">03</div>
                  <div className="mission-card-name">NIGHT RAID</div>
                  <p className="mission-card-desc">
                    Infiltriere den Luftraum bei Nacht. Zerstöre feindliche Bomber bevor sie deine Basis
                    erreichen.
                  </p>
                  <div className="mission-difficulty">
                    Schwierigkeit:{' '}
                    <span className="mission-star" style={{ opacity: 0.5 }}>
                      ★★★★
                    </span>
                    <span className="mission-star-empty">☆</span>
                  </div>
                  <span className="mission-card-badge locked-badge">🔒 Demnächst</span>
                </div>

                <div className="mission-card is-locked">
                  <div className="mission-card-nr">04</div>
                  <div className="mission-card-name">FINAL ASSAULT</div>
                  <p className="mission-card-desc">
                    Die finale Schlacht. Stelle dich der gesamten gegnerischen Luftflotte und verteidige
                    dein Heimatland.
                  </p>
                  <div className="mission-difficulty">
                    Schwierigkeit:{' '}
                    <span className="mission-star" style={{ opacity: 0.5 }}>
                      ★★★★★
                    </span>
                  </div>
                  <span className="mission-card-badge locked-badge">🔒 Demnächst</span>
                </div>
              </div>

              <button type="button" className="glass-button glass-button-primary w-full py-3.5" onClick={startMission}>
                Mission starten · {selected.callsign}
              </button>
            </div>
          </div>
        )}

        {/* ═══════════════ SETTINGS ═══════════════ */}
        {screen === 'settings' && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-y-auto px-4 py-6">
            <div className="glass-panel pointer-events-auto w-full max-w-lg p-6 sm:p-8">
              <div className="mb-1 flex items-center justify-between">
                <div className="glass-eyebrow">System</div>
                <button
                  type="button"
                  className="glass-button glass-button-ghost !px-3 !py-1.5 !text-xs"
                  onClick={() => navigateTo('main')}
                >
                  ← Zurück
                </button>
              </div>
              <h2 className="glass-title mb-4 text-3xl">Einstellungen</h2>
              <SettingsBody />
            </div>
          </div>
        )}

          <ExitModal />
        </div>
      </div>
    </div>
  );
}
