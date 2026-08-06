import type { HudData } from '../game/Game';
import { CONFIG } from '../game/config';
import { loadSettings } from '../lib/gameSettings';

const CYAN = '#00F2FF';
const AMBER = '#FF9F0A';
const DANGER = '#FF3B30';
const BLUE = '#0A84FF';

// Tactical HUD — Apple Liquid Glass + War Thunder triple reticle
export function Hud({ data }: { data: HudData }) {
  const showHud = loadSettings().showHud;
  const lockPct = Math.round(data.lockProgress * 100);
  const dmg = data.damage;
  const hullPct = dmg?.hullPct ?? Math.round((data.hp / Math.max(1, data.maxHp)) * 100);
  const hullTone = hullPct > 60 ? CYAN : hullPct > 30 ? AMBER : DANGER;

  if (data.state === 'menu') return null;
  if (!showHud && data.state === 'playing') {
    // Reticles bleiben fürs Zielen sichtbar
  }

  const showReticles = data.state === 'playing' || data.state === 'paused';
  const showChrome = showHud || data.state !== 'playing';

  return (
    <div className="hud-tactical pointer-events-none absolute inset-0 select-none">
      {/* ═══ Triple-Reticle ═══ */}
      {showReticles && !data.freeLook && (
        <>
          {data.gunCrosshair?.visible && (
            <div
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${data.gunCrosshair.x}%`, top: `${data.gunCrosshair.y}%`, opacity: 0.7 }}
            >
              <svg width="36" height="36" viewBox="0 0 36 36">
                <line x1="18" y1="4" x2="18" y2="12" stroke={CYAN} strokeWidth="1.2" opacity="0.75" />
                <line x1="18" y1="24" x2="18" y2="32" stroke={CYAN} strokeWidth="1.2" opacity="0.75" />
                <line x1="4" y1="18" x2="12" y2="18" stroke={CYAN} strokeWidth="1.2" opacity="0.75" />
                <line x1="24" y1="18" x2="32" y2="18" stroke={CYAN} strokeWidth="1.2" opacity="0.75" />
                <circle cx="18" cy="18" r="1.5" fill={CYAN} opacity="0.8" />
              </svg>
            </div>
          )}

          {data.velocityVector?.visible && (
            <div
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${data.velocityVector.x}%`, top: `${data.velocityVector.y}%` }}
            >
              <svg width="44" height="44" viewBox="0 0 44 44">
                <circle cx="22" cy="22" r="10" fill="none" stroke={BLUE} strokeWidth="1.4" opacity="0.9" />
                <circle cx="22" cy="22" r="2" fill={BLUE} opacity="0.85" />
                <line x1="22" y1="2" x2="22" y2="10" stroke={BLUE} strokeWidth="1.2" opacity="0.65" />
              </svg>
            </div>
          )}

          {data.mouseReticle?.visible && (
            <div
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{
                left: `${data.mouseReticle.x}%`,
                top: `${data.mouseReticle.y}%`,
                opacity: data.manualOverride ? 0.28 : 0.95,
              }}
            >
              <svg width="72" height="72" viewBox="0 0 72 72">
                <circle cx="36" cy="36" r="18" fill="none" stroke={CYAN} strokeWidth="1.6" opacity="0.95" />
                <line x1="36" y1="8" x2="36" y2="22" stroke={CYAN} strokeWidth="1.6" />
                <line x1="36" y1="50" x2="36" y2="64" stroke={CYAN} strokeWidth="1.6" />
                <line x1="8" y1="36" x2="22" y2="36" stroke={CYAN} strokeWidth="1.6" />
                <line x1="50" y1="36" x2="64" y2="36" stroke={CYAN} strokeWidth="1.6" />
                <circle cx="36" cy="36" r="2.2" fill={CYAN} />
              </svg>
            </div>
          )}

          {/* Lead-Indicator (War Thunder Vorhalt) — Nase hierhin, nicht auf das Flugzeug */}
          {data.leadIndicator?.visible && (
            <div
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{
                left: `${data.leadIndicator.x}%`,
                top: `${data.leadIndicator.y}%`,
                opacity: 0.95,
              }}
            >
              <svg width="40" height="40" viewBox="0 0 40 40">
                <circle
                  cx="20"
                  cy="20"
                  r="7"
                  fill="none"
                  stroke="#FFE566"
                  strokeWidth="1.6"
                  opacity="0.95"
                />
                <line x1="20" y1="2" x2="20" y2="10" stroke="#FFE566" strokeWidth="1.5" />
                <line x1="20" y1="30" x2="20" y2="38" stroke="#FFE566" strokeWidth="1.5" />
                <line x1="2" y1="20" x2="10" y2="20" stroke="#FFE566" strokeWidth="1.5" />
                <line x1="30" y1="20" x2="38" y2="20" stroke="#FFE566" strokeWidth="1.5" />
                <circle cx="20" cy="20" r="1.4" fill="#FFE566" opacity="0.9" />
              </svg>
            </div>
          )}
        </>
      )}

      {/* World target markers */}
      {showChrome &&
        data.worldMarkers?.map((m, i) => {
          if (!m.visible) return null;
          const pct = Math.max(0, Math.min(100, (m.hp / Math.max(1, m.maxHp)) * 100));
          const barColor = pct > 50 ? DANGER : pct > 25 ? AMBER : '#ff2222';
          const distLabel = m.distM >= 1000 ? `${(m.distM / 1000).toFixed(1)} km` : `${m.distM} m`;
          return (
            <div
              key={`wm-${i}`}
              className="absolute -translate-x-1/2 -translate-y-full"
              style={{ left: `${m.x}%`, top: `${m.y}%`, opacity: m.locked ? 1 : 0.9 }}
            >
              <div
                className="mb-0.5 text-center text-[10px] font-bold tracking-wide whitespace-nowrap"
                style={{ color: m.locked ? DANGER : '#ff8a80', textShadow: '0 0 6px #000' }}
              >
                {m.locked ? '◆ ' : ''}
                {distLabel}
              </div>
              <div
                className="h-1.5 w-16 overflow-hidden rounded-full border"
                style={{
                  borderColor: m.locked ? 'rgba(255,59,48,0.7)' : 'rgba(255,255,255,0.2)',
                  background: 'rgba(15,20,32,0.65)',
                }}
              >
                <div className="h-full transition-all" style={{ width: `${pct}%`, background: barColor }} />
              </div>
              <div className="mt-0.5 text-center text-[9px] whitespace-nowrap text-white/60">
                {m.name.replace(/^BANDIT \d+ · /, '')}
              </div>
            </div>
          );
        })}

      {/* Lock diamond */}
      {showChrome && data.lockProgress > 0 && (
        <div
          className="absolute -translate-x-1/2 -translate-y-1/2"
          style={{
            left: data.lockScreen ? `${data.lockScreen.x}%` : '50%',
            top: data.lockScreen ? `${data.lockScreen.y}%` : '50%',
            transform: `translate(-50%, -50%) scale(${1.6 - data.lockProgress * 0.6})`,
          }}
        >
          <svg width="150" height="150" viewBox="0 0 150 150">
            <rect
              x="45"
              y="45"
              width="60"
              height="60"
              fill="none"
              stroke={data.lockProgress >= 1 ? DANGER : CYAN}
              strokeWidth="2"
              transform="rotate(45 75 75)"
            />
          </svg>
          <div
            className="absolute -bottom-7 left-1/2 -translate-x-1/2 text-sm font-bold whitespace-nowrap"
            style={{ color: data.lockProgress >= 1 ? DANGER : CYAN }}
          >
            {data.lockProgress >= 1 ? `◆ LOCK — ${data.lockedTargetName}` : `LOCKING ${lockPct}%`}
          </div>
        </div>
      )}

      {showChrome && (
        <>
          {/* Top center heading pill */}
          <div className="absolute left-1/2 top-4 -translate-x-1/2">
            <div className="hud-glass-pill flex items-center gap-4 px-5 py-2">
              <div className="text-center">
                <div className="hud-label">HDG</div>
                <div className="hud-value text-xl tracking-[0.2em]">
                  {String(data.headingDeg).padStart(3, '0')}°
                </div>
              </div>
              <div className="h-8 w-px bg-white/15" />
              <div className="text-center">
                <div className="hud-label">G</div>
                <div
                  className="hud-value text-xl"
                  style={{ color: data.gForce > 6 ? DANGER : undefined }}
                >
                  {data.gForce.toFixed(1)}
                </div>
              </div>
            </div>
          </div>

          {/* Mission glass (top left) */}
          <div className="absolute left-5 top-5">
            <div className="hud-glass-pill min-w-[180px]">
              <div className="hud-label">Mission · {data.jetName}</div>
              <div className="hud-value mt-0.5 text-lg">
                Welle {Math.min(data.waveIndex + 1, data.waveCount)}/{data.waveCount}
              </div>
              <div className="mt-1 text-xs text-white/55">
                Bandits {data.enemiesAlive}
                {data.samsLeft > 0 ? ` · SAM ${data.samsLeft}` : ''}
              </div>
            </div>
          </div>

          {/* Damage glass (top right) */}
          <div className="absolute right-5 top-5 w-52">
            <div
              className="hud-glass-pill"
              style={{
                borderColor:
                  hullPct > 50 ? 'rgba(0,242,255,0.22)' : 'rgba(255,59,48,0.45)',
              }}
            >
              <div className="hud-label">Airframe</div>
              <div className="mt-0.5 text-sm font-bold" style={{ color: hullTone }}>
                {dmg?.status ?? 'NOMINAL'}
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <div className="glass-progress-track flex-1">
                  <div
                    className={`glass-progress-fill ${hullPct <= 30 ? 'danger' : hullPct <= 60 ? 'warn' : ''}`}
                    style={{ width: `${hullPct}%` }}
                  />
                </div>
                <div className="hud-value w-10 text-right text-xs" style={{ color: hullTone }}>
                  {hullPct}%
                </div>
              </div>
              <div className="mt-2 space-y-0.5 text-[10px]">
                {(dmg?.systems ?? []).map((s) => (
                  <div key={s.name} className="flex justify-between gap-2">
                    <span className="text-white/40">{s.name}</span>
                    <span style={{ color: s.ok ? CYAN : DANGER }}>{s.ok ? 'OK' : 'FAIL'}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Speed pill (left mid) */}
          <div className="absolute left-[4%] top-1/2 -translate-y-1/2">
            <div className="hud-glass-pill min-w-[108px] text-center">
              <div className="hud-label">Knots</div>
              <div className="hud-value text-3xl">{data.speedKnots}</div>
              <div className="mt-1 text-[11px] text-white/45">
                MACH {(data.speedKnots / 661.7).toFixed(2)}
              </div>
              <div className="mt-3 hud-label">Fuel / THR</div>
              <div className="mx-auto mt-1 h-20 w-2.5 overflow-hidden rounded-full border border-white/15 bg-white/10">
                <div
                  className="w-full rounded-full bg-gradient-to-t from-[#0A84FF] to-[#00F2FF] transition-all"
                  style={{
                    height: `${data.throttle * 100}%`,
                    marginTop: `${(1 - data.throttle) * 100}%`,
                    boxShadow: '0 0 10px #00F2FF',
                  }}
                />
              </div>
              {data.afterburner && (
                <div className="mt-1 text-[10px] font-bold tracking-widest" style={{ color: AMBER }}>
                  WEP
                </div>
              )}
              {data.airbrake && (
                <div className="mt-0.5 text-[10px] font-bold tracking-widest" style={{ color: BLUE }}>
                  BRK
                </div>
              )}
            </div>
          </div>

          {/* Altitude pill (right mid) */}
          <div className="absolute right-[4%] top-1/2 -translate-y-1/2">
            <div className="hud-glass-pill min-w-[108px] text-center">
              <div className="hud-label">Alt ft</div>
              <div className="hud-value text-3xl">{data.altitudeFt.toLocaleString()}</div>
              <div className="mt-3 hud-label">Missiles</div>
              <div className="hud-value text-xl">× {data.missiles}</div>
              {data.maxFlares > 0 && (
                <>
                  <div className="mt-3 hud-label" style={{ color: data.flareActive ? AMBER : undefined }}>
                    Flares
                  </div>
                  <div
                    className="hud-value text-xl"
                    style={{ color: data.flares <= 0 ? DANGER : data.flareActive ? AMBER : undefined }}
                  >
                    × {data.flares}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Radar glass bottom left — War Thunder style TWS */}
          <div className="absolute bottom-5 left-5">
            {(() => {
              const sz = CONFIG.hud.radarSize;
              const km = CONFIG.hud.radarRange / 1000;
              const R = 92;
              const scale = R * 0.92;
              const threats = data.radar.filter((c) => c.kind === 'missile' && c.incoming);
              const bandits = data.radar.filter((c) => c.kind === 'bandit').length;
              return (
                <div className="hud-radar-panel">
                  <div className="hud-radar-header">
                    <span className="hud-radar-title">TWS</span>
                    <span className="hud-radar-range">{km.toFixed(0)} km</span>
                    {threats.length > 0 && (
                      <span className="hud-radar-alert">MSSL ×{threats.length}</span>
                    )}
                  </div>
                  <div className="hud-radar-scope" style={{ width: sz, height: sz }}>
                    <svg
                      width={sz}
                      height={sz}
                      viewBox="-100 -100 200 200"
                      className="hud-radar-svg"
                    >
                      <defs>
                        <radialGradient id="radarScopeBg" cx="50%" cy="50%" r="50%">
                          <stop offset="0%" stopColor="rgba(0,40,55,0.95)" />
                          <stop offset="70%" stopColor="rgba(4,14,28,0.98)" />
                          <stop offset="100%" stopColor="rgba(2,6,14,1)" />
                        </radialGradient>
                        <linearGradient id="radarSweepGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="rgba(0,242,255,0)" />
                          <stop offset="70%" stopColor="rgba(0,242,255,0.08)" />
                          <stop offset="100%" stopColor="rgba(0,242,255,0.35)" />
                        </linearGradient>
                        <filter id="radarGlow" x="-50%" y="-50%" width="200%" height="200%">
                          <feGaussianBlur stdDeviation="1.2" result="b" />
                          <feMerge>
                            <feMergeNode in="b" />
                            <feMergeNode in="SourceGraphic" />
                          </feMerge>
                        </filter>
                      </defs>

                      {/* Scope face */}
                      <circle cx="0" cy="0" r={R} fill="url(#radarScopeBg)" />
                      <circle
                        cx="0"
                        cy="0"
                        r={R}
                        fill="none"
                        stroke="rgba(0,242,255,0.45)"
                        strokeWidth="1.6"
                      />
                      <circle
                        cx="0"
                        cy="0"
                        r={R - 1.5}
                        fill="none"
                        stroke="rgba(0,242,255,0.12)"
                        strokeWidth="0.6"
                      />

                      {/* Range rings */}
                      {[0.33, 0.66, 1].map((f) => (
                        <circle
                          key={f}
                          cx="0"
                          cy="0"
                          r={R * f * 0.92}
                          fill="none"
                          stroke="rgba(0,242,255,0.14)"
                          strokeWidth="0.7"
                          strokeDasharray={f === 1 ? undefined : '2 3'}
                        />
                      ))}

                      {/* Cross + diagonal ticks */}
                      <line x1={-R + 4} y1="0" x2={R - 4} y2="0" stroke="rgba(0,242,255,0.12)" strokeWidth="0.5" />
                      <line x1="0" y1={-R + 4} x2="0" y2={R - 4} stroke="rgba(0,242,255,0.12)" strokeWidth="0.5" />
                      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
                        const a = (deg * Math.PI) / 180;
                        const x1 = Math.sin(a) * (R - 8);
                        const y1 = -Math.cos(a) * (R - 8);
                        const x2 = Math.sin(a) * (R - 3);
                        const y2 = -Math.cos(a) * (R - 3);
                        return (
                          <line
                            key={deg}
                            x1={x1}
                            y1={y1}
                            x2={x2}
                            y2={y2}
                            stroke="rgba(0,242,255,0.28)"
                            strokeWidth="1"
                          />
                        );
                      })}

                      {/* Range labels (outer half) */}
                      <text x="4" y={-R * 0.33 + 3} fill="rgba(0,242,255,0.35)" fontSize="7" fontFamily="monospace">
                        {(km * 0.33).toFixed(1)}
                      </text>
                      <text x="4" y={-R * 0.66 + 3} fill="rgba(0,242,255,0.35)" fontSize="7" fontFamily="monospace">
                        {(km * 0.66).toFixed(1)}
                      </text>

                      {/* Rotating sweep */}
                      <g className="hud-radar-sweep">
                        <path
                          d={`M 0 0 L 0 ${-R * 0.92} A ${R * 0.92} ${R * 0.92} 0 0 1 ${R * 0.92 * 0.5} ${-R * 0.92 * 0.866} Z`}
                          fill="url(#radarSweepGrad)"
                        />
                        <line
                          x1="0"
                          y1="0"
                          x2="0"
                          y2={-R * 0.92}
                          stroke="rgba(0,242,255,0.55)"
                          strokeWidth="1.2"
                        />
                      </g>

                      {/* Contacts */}
                      {data.radar.map((r, i) => {
                        const cx = r.x * scale;
                        const cy = r.y * scale;
                        if (r.kind === 'missile') {
                          const col = r.incoming ? DANGER : 'rgba(255,180,80,0.85)';
                          return (
                            <g key={`m-${i}`} filter="url(#radarGlow)" className={r.incoming ? 'hud-radar-blink' : undefined}>
                              {/* Diamond = missile threat */}
                              <polygon
                                points={`${cx},${cy - 5} ${cx + 4},${cy} ${cx},${cy + 5} ${cx - 4},${cy}`}
                                fill={r.incoming ? 'rgba(255,59,48,0.35)' : 'rgba(255,159,10,0.25)'}
                                stroke={col}
                                strokeWidth="1.4"
                              />
                              {r.incoming && (
                                <line
                                  x1={cx}
                                  y1={cy}
                                  x2="0"
                                  y2="0"
                                  stroke="rgba(255,59,48,0.35)"
                                  strokeWidth="0.8"
                                  strokeDasharray="2 2"
                                />
                              )}
                            </g>
                          );
                        }
                        if (r.kind === 'sam') {
                          return (
                            <g key={`s-${i}`}>
                              <rect
                                x={cx - 3.5}
                                y={cy - 3.5}
                                width="7"
                                height="7"
                                fill={r.locked ? 'rgba(255,159,10,0.35)' : 'rgba(255,159,10,0.15)'}
                                stroke={AMBER}
                                strokeWidth={r.locked ? 1.6 : 1.1}
                              />
                            </g>
                          );
                        }
                        // bandit
                        return (
                          <g key={`b-${i}`} filter={r.locked ? 'url(#radarGlow)' : undefined}>
                            {r.locked ? (
                              <>
                                <polygon
                                  points={`${cx},${cy - 6} ${cx + 5},${cy + 4} ${cx - 5},${cy + 4}`}
                                  fill="rgba(255,59,48,0.25)"
                                  stroke={DANGER}
                                  strokeWidth="1.5"
                                />
                                <circle cx={cx} cy={cy} r="9" fill="none" stroke={DANGER} strokeWidth="0.8" opacity="0.7" />
                              </>
                            ) : (
                              <polygon
                                points={`${cx},${cy - 5} ${cx + 4.2},${cy + 3.5} ${cx - 4.2},${cy + 3.5}`}
                                fill={DANGER}
                                stroke="rgba(255,120,100,0.9)"
                                strokeWidth="0.6"
                                opacity="0.95"
                              />
                            )}
                          </g>
                        );
                      })}

                      {/* Own aircraft (center) */}
                      <polygon
                        points="0,-7 5,6 -5,6"
                        fill={CYAN}
                        stroke="rgba(255,255,255,0.5)"
                        strokeWidth="0.5"
                        filter="url(#radarGlow)"
                      />
                      <circle cx="0" cy="0" r="1.5" fill="#fff" opacity="0.9" />
                    </svg>
                  </div>
                  <div className="hud-radar-legend">
                    <span><i className="hud-leg-bandit" /> Bandit {bandits}</span>
                    <span><i className="hud-leg-sam" /> SAM</span>
                    <span><i className="hud-leg-mssl" /> MSSL</span>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Score / Weapons glass bottom right */}
          <div className="absolute bottom-5 right-5 text-right">
            <div className="hud-glass-pill min-w-[150px]">
              <div className="hud-label">Score</div>
              <div className="hud-value text-3xl">{data.score}</div>
              <div className="mt-2 text-xs text-white/50">AIM-9 × {data.missiles}</div>
              {/* Kanonen-Munition + Reload */}
              <div
                className="mt-1 text-xs font-semibold tracking-wide"
                style={{
                  color: data.reloading
                    ? AMBER
                    : data.ammo <= 50
                      ? DANGER
                      : 'rgba(255,255,255,0.7)',
                }}
              >
                {data.reloading
                  ? 'RELOADING…'
                  : `AMMO ${data.ammo}`}
              </div>
              {data.reloading && (
                <div className="mt-1 ml-auto h-1.5 w-24 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full transition-[width] duration-100"
                    style={{
                      width: `${Math.round((data.reloadProgress ?? 0) * 100)}%`,
                      background: `linear-gradient(90deg, ${AMBER}, #ffe566)`,
                      boxShadow: `0 0 8px ${AMBER}`,
                    }}
                  />
                </div>
              )}
              {data.maxFlares > 0 && (
                <div className="text-xs text-white/50">
                  Flares × {data.flares}
                  {data.flareActive ? ' · HOT' : ''}
                </div>
              )}
              <div className="text-xs text-white/50">Bandits {data.enemiesAlive}</div>
            </div>
          </div>
        </>
      )}

      {/* Wave banner */}
      {data.waveBanner && (
        <div className="absolute left-1/2 top-[22%] -translate-x-1/2 text-center">
          <div
            className="glass-panel-sm glass-pulse px-6 py-3 text-2xl font-black tracking-[0.2em] text-white sm:text-3xl"
            style={{ textShadow: `0 0 20px ${CYAN}` }}
          >
            {data.waveBanner}
          </div>
        </div>
      )}

      {data.freeLook && (
        <div className="absolute left-1/2 top-[16%] -translate-x-1/2">
          <div className="hud-glass-pill text-center">
            <div className="text-sm font-bold tracking-[0.3em] text-white">FREE LOOK</div>
            <div className="mt-0.5 text-[11px] text-white/50">C / RMB loslassen · Jet behält Kurs</div>
          </div>
        </div>
      )}

      {data.manualOverride && !data.freeLook && data.state === 'playing' && (
        <div className="absolute left-1/2 top-[13%] -translate-x-1/2">
          <div className="hud-glass-pill !border-amber-400/40 px-4 py-1.5 text-[11px] font-bold tracking-[0.25em]" style={{ color: AMBER }}>
            MANUAL STICK
          </div>
        </div>
      )}

      {data.autoTrack && !data.freeLook && (
        <div className="absolute left-1/2 top-[15%] -translate-x-1/2 text-center">
          <div className="hud-glass-pill !border-orange-400/40">
            <div className="text-sm font-bold tracking-[0.25em]" style={{ color: '#ff8a65' }}>
              AUTO TRACK
            </div>
            <div className="text-[11px] text-white/50">{data.lockedTargetName ?? 'LOCK'}</div>
          </div>
        </div>
      )}

      {data.warning && (
        <div className="absolute left-1/2 top-[30%] -translate-x-1/2">
          <div
            className="glass-panel-sm glass-pulse px-6 py-3 text-2xl font-black tracking-[0.25em] sm:text-3xl"
            style={{ color: DANGER, borderColor: 'rgba(255,59,48,0.5)' }}
          >
            ⚠ {data.warning}
          </div>
        </div>
      )}

      {/* Kill Confirm — Apple Glass Splash Popup */}
      {data.killPopup && data.state === 'playing' && (
        <div key={data.killPopup.id} className="kill-popup" aria-live="polite">
          <div className="kill-popup-ring" />
          <div className={`kill-popup-card ${data.killPopup.kind === 'ground' ? 'is-ground' : ''}`}>
            <div className="kill-popup-title">{data.killPopup.title}</div>
            <div className="kill-popup-target">{data.killPopup.targetName}</div>
            <div className="kill-popup-points">+{data.killPopup.points}</div>
            <div className="kill-popup-badge">
              {data.killPopup.kind === 'air' ? 'Air Kill' : 'Ground Kill'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
