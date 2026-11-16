import type { ComponentChildren } from 'preact';

/** Inline stroke icons (decorative: always paired with a text label or aria-label). */
function Svg({
  size = 22,
  fill = false,
  children,
}: {
  size?: number;
  fill?: boolean;
  children: ComponentChildren;
}) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill ? 'currentColor' : 'none'}
      stroke={fill ? 'none' : 'currentColor'}
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      {children}
    </svg>
  );
}

export const HomeIcon = () => (
  <Svg>
    <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />
  </Svg>
);

export const MarketIcon = () => (
  <Svg>
    <polyline points="3 17 9 11 13 15 21 7" />
    <polyline points="15 7 21 7 21 13" />
  </Svg>
);

export const PortfolioIcon = () => (
  <Svg>
    <rect x="3" y="7" width="18" height="13" rx="2" />
    <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </Svg>
);

export const LearnIcon = () => (
  <Svg>
    <path d="M4 5a2 2 0 0 1 2-2h14v16H6a2 2 0 0 0-2 2z" />
    <path d="M4 21V5" />
  </Svg>
);

export const PlayIcon = ({ size = 16 }: { size?: number }) => (
  <Svg size={size} fill>
    <polygon points="6 4 20 12 6 20 6 4" />
  </Svg>
);

export const PauseIcon = ({ size = 16 }: { size?: number }) => (
  <Svg size={size} fill>
    <rect x="6" y="4" width="4" height="16" rx="1" />
    <rect x="14" y="4" width="4" height="16" rx="1" />
  </Svg>
);

export const SkipIcon = () => (
  <Svg size={14}>
    <polygon points="5 4 15 12 5 20 5 4" />
    <line x1="19" y1="5" x2="19" y2="19" />
  </Svg>
);

export const BackIcon = () => (
  <Svg>
    <polyline points="15 18 9 12 15 6" />
  </Svg>
);

export const PlusIcon = () => (
  <Svg size={16}>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </Svg>
);

export const CloseIcon = () => (
  <Svg size={16}>
    <line x1="6" y1="6" x2="18" y2="18" />
    <line x1="18" y1="6" x2="6" y2="18" />
  </Svg>
);

export const ReplayIcon = () => (
  <Svg size={18}>
    <polyline points="1 4 1 10 7 10" />
    <path d="M3.5 15a9 9 0 1 0 2.1-9.4L1 10" />
  </Svg>
);
