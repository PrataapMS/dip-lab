import type { JSX } from 'preact';
import type { BadgeGroup } from '../game/badges';

/** Line icons for the 24 badges (24 × 24, stroke = currentColor), plus the lock for unearned ones. */
const PATHS: Record<string, JSX.Element> = {
  'first-trade': (
    <>
      <polyline points="3 17 9 11 13 15 21 7" />
      <polyline points="15 7 21 7 21 13" />
    </>
  ),
  'limit-legend': (
    <>
      <line x1="3" y1="15" x2="21" y2="15" />
      <line x1="12" y1="4" x2="12" y2="12" />
      <polyline points="9 9 12 12 15 9" />
    </>
  ),
  'stop-master': (
    <>
      <polygon points="8 3 16 3 21 8 21 16 16 21 8 21 3 16 3 8" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </>
  ),
  'dividend-collector': (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M15 9.5c-.5-1-1.6-1.5-3-1.5-1.7 0-3 .9-3 2s1.3 1.7 3 2 3 .9 3 2-1.3 2-3 2c-1.4 0-2.5-.5-3-1.5" />
      <line x1="12" y1="5.5" x2="12" y2="8" />
      <line x1="12" y1="16" x2="12" y2="18.5" />
    </>
  ),
  diversified: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3v9l6.5 6" />
      <path d="M12 12H3" />
    </>
  ),
  'bought-the-dip': (
    <>
      <polyline points="3 6 10 15 14 11 21 18" />
      <circle cx="10" cy="15" r="2" />
    </>
  ),
  'diamond-hands': (
    <>
      <polygon points="6 3 18 3 22 9 12 21 2 9 6 3" />
      <line x1="2" y1="9" x2="22" y2="9" />
    </>
  ),
  'steady-hands': (
    <>
      <circle cx="12" cy="5" r="2" />
      <line x1="12" y1="7" x2="12" y2="21" />
      <path d="M5 13a7 7 0 0 0 14 0" />
    </>
  ),
  'low-cost': (
    <>
      <path d="M3 12V4h8l10 10-8 8z" />
      <circle cx="7.5" cy="7.5" r="1.5" />
    </>
  ),
  comeback: (
    <>
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.5 15a9 9 0 1 0 2.1-9.4L1 10" />
    </>
  ),
  'index-slayer': (
    <>
      <path d="M8 21h8" />
      <path d="M12 17v4" />
      <path d="M7 4h10v5a5 5 0 0 1-10 0z" />
      <path d="M17 5h3v2a3 3 0 0 1-3 3" />
      <path d="M7 5H4v2a3 3 0 0 0 3 3" />
    </>
  ),
  'straight-a': (
    <>
      <path d="M5 20 12 4l7 16" />
      <line x1="8" y1="14" x2="16" y2="14" />
    </>
  ),
  survivor: (
    <>
      <path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z" />
      <polyline points="8.5 12 11 14.5 15.5 10" />
    </>
  ),
  graduate: (
    <>
      <polygon points="12 4 22 9 12 14 2 9 12 4" />
      <path d="M6 11v5c3 2 9 2 12 0v-5" />
    </>
  ),
  'boss-slayer': (
    <>
      <path d="M14.5 17.5 3 6V3h3l11.5 11.5" />
      <line x1="13" y1="19" x2="19" y2="13" />
      <line x1="16" y1="16" x2="20" y2="20" />
    </>
  ),
  'crash-tested': <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />,
  'bubble-dodger': (
    <>
      <circle cx="9" cy="10" r="5" />
      <circle cx="17" cy="15" r="3" />
      <circle cx="8" cy="19" r="1.5" />
    </>
  ),
  'meme-survivor': (
    <>
      <path d="M5 19c1-3 3-5 6-6" />
      <path d="M14 4c3 0 6 3 6 6l-7 7-6-6z" />
      <circle cx="15" cy="9" r="1.5" />
    </>
  ),
  'margin-survivor': (
    <>
      <line x1="12" y1="3" x2="12" y2="21" />
      <line x1="5" y1="7" x2="19" y2="7" />
      <path d="M5 7l-3 6a3 3 0 0 0 6 0z" />
      <path d="M19 7l-3 6a3 3 0 0 0 6 0z" />
    </>
  ),
  'short-seller': (
    <>
      <polyline points="3 7 9 13 13 9 21 17" />
      <polyline points="15 17 21 17 21 11" />
    </>
  ),
  'replay-pro': (
    <>
      <polygon points="11 19 2 12 11 5 11 19" />
      <polygon points="22 19 13 12 22 5 22 19" />
    </>
  ),
  'week-streak': <path d="M12 2c1 4 5 6 5 11a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-6 1-9.5z" />,
  scholar: (
    <>
      <path d="M4 5a2 2 0 0 1 2-2h14v16H6a2 2 0 0 0-2 2z" />
      <path d="M4 21V5" />
    </>
  ),
  'quest-hunter': (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ),
};

export const GROUP_COLOR: Record<BadgeGroup, string> = {
  basics: 'var(--accent)',
  process: 'var(--warn)',
  results: 'var(--accent)',
  advanced: 'var(--xp)',
  habits: 'var(--xp)',
};

export function BadgeIcon({ id, size = 22 }: { id: string; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      {PATHS[id] ?? PATHS.lock}
    </svg>
  );
}

export function FlameIcon({ size = 14 }: { size?: number }) {
  return <BadgeIcon id="week-streak" size={size} />;
}

export function LockIcon({ size = 18 }: { size?: number }) {
  return <BadgeIcon id="lock" size={size} />;
}
