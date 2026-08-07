import type { JetId, JetFaction } from '../game/aircraft/JetCatalog';

/** Top-view style silhouettes for hangar cards (War Thunder hangar vibe). */
const PATHS: Record<JetId, string> = {
  // Single-engine fighter (F-16-like)
  f16: 'M80 8 L86 28 L118 42 L122 48 L88 44 L92 72 L108 88 L100 92 L80 78 L60 92 L52 88 L68 72 L72 44 L38 48 L42 42 L74 28 Z M76 20 L80 4 L84 20',
  // Stealth diamond (F-35-like)
  f35: 'M80 6 L92 30 L130 48 L124 54 L88 48 L90 78 L105 94 L96 96 L80 82 L64 96 L55 94 L70 78 L72 48 L36 54 L30 48 L68 30 Z',
  // Elite interceptor — sharp delta
  elite: 'M80 4 L95 36 L140 50 L128 56 L92 50 L94 85 L110 100 L98 100 L80 86 L62 100 L50 100 L66 85 L68 50 L32 56 L20 50 L65 36 Z',
  // Twin-engine swing-wing feel (F-14-like)
  f14: 'M80 10 L88 26 L135 40 L140 48 L95 46 L98 70 L125 78 L120 86 L90 76 L88 92 L100 100 L80 94 L60 100 L72 92 L70 76 L40 86 L35 78 L62 70 L65 46 L20 48 L25 40 L72 26 Z M74 18 L80 6 L86 18',
  // Trainer / light jet (L-39)
  l39: 'M80 12 L86 30 L110 44 L112 50 L88 46 L90 75 L100 90 L92 92 L80 80 L68 92 L60 90 L70 75 L72 46 L48 50 L50 44 L74 30 Z M76 22 L80 8 L84 22',
  // Attack / stubby wings (Su-25)
  su25: 'M80 18 L90 32 L128 42 L132 52 L95 50 L98 72 L115 82 L108 90 L90 78 L88 95 L100 102 L80 96 L60 102 L72 95 L70 78 L52 90 L45 82 L62 72 L65 50 L28 52 L32 42 L70 32 Z',
  // Twin-seat strike (Su-34-ish bulk)
  su34: 'M80 8 L92 28 L138 40 L142 52 L100 50 L102 70 L130 78 L122 88 L95 76 L92 95 L105 104 L80 96 L55 104 L68 95 L65 76 L38 88 L30 78 L58 70 L60 50 L18 52 L22 40 L68 28 Z M74 20 L80 5 L86 20',
  // Stealth fifth-gen (Su-57-ish)
  su57: 'M80 5 L94 28 L136 44 L128 52 L92 46 L96 78 L118 92 L105 98 L80 84 L55 98 L42 92 L64 78 L68 46 L32 52 L24 44 L66 28 Z',
};

/** Compact nav / HUD icons */
export function NavIcon({
  name,
  className = '',
}: {
  name: 'home' | 'hangar' | 'campaign' | 'maps' | 'settings' | 'exit' | 'launch' | 'map';
  className?: string;
}) {
  const common = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'square' as const,
    strokeLinejoin: 'miter' as const,
    className,
    'aria-hidden': true as const,
  };

  switch (name) {
    case 'home':
      return (
        <svg {...common}>
          <path d="M4 11 L12 4 L20 11 V20 H14 V14 H10 V20 H4 Z" />
        </svg>
      );
    case 'hangar':
      return (
        <svg {...common}>
          <path d="M3 18 L5 8 L12 4 L19 8 L21 18 Z" />
          <path d="M8 18 V12 H16 V18" />
          <path d="M12 8 L14 11 L10 11 Z" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'campaign':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2 V5 M12 19 V22 M2 12 H5 M19 12 H22" />
        </svg>
      );
    case 'maps':
    case 'map':
      return (
        <svg {...common}>
          <path d="M4 6 L10 4 L14 6 L20 4 V18 L14 20 L10 18 L4 20 Z" />
          <path d="M10 4 V18 M14 6 V20" />
        </svg>
      );
    case 'settings':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 3 V6 M12 18 V21 M3 12 H6 M18 12 H21 M5.5 5.5 L7.5 7.5 M16.5 16.5 L18.5 18.5 M18.5 5.5 L16.5 7.5 M7.5 16.5 L5.5 18.5" />
        </svg>
      );
    case 'exit':
      return (
        <svg {...common}>
          <path d="M10 4 H5 V20 H10" />
          <path d="M14 12 H21" />
          <path d="M18 8 L22 12 L18 16" />
        </svg>
      );
    case 'launch':
      return (
        <svg {...common}>
          <path d="M12 20 V8" />
          <path d="M8 12 L12 6 L16 12" />
          <path d="M7 20 H17" />
        </svg>
      );
    default:
      return null;
  }
}

export function JetSilhouette({
  jetId,
  faction,
  size = 'md',
  locked = false,
  className = '',
}: {
  jetId: JetId;
  faction: JetFaction;
  size?: 'sm' | 'md';
  locked?: boolean;
  className?: string;
}) {
  const path = PATHS[jetId] ?? PATHS.f16;
  const plateClass =
    size === 'sm'
      ? `jet-icon-sm is-${faction} ${className}`
      : `jet-icon-plate is-${faction} ${locked ? 'is-locked' : ''} ${className}`;

  return (
    <div className={plateClass} aria-hidden="true">
      <svg viewBox="0 0 160 110" xmlns="http://www.w3.org/2000/svg">
        <path d={path} strokeWidth={size === 'sm' ? 1.2 : 1.5} strokeLinejoin="round" />
        {/* nose accent */}
        <circle cx="80" cy={jetId === 'su25' ? 22 : 12} r={size === 'sm' ? 1.5 : 2.2} fill="currentColor" opacity="0.5" />
      </svg>
    </div>
  );
}
