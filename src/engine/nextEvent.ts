import type { BuiltMarket } from './market';

/** "Next event" plays ahead at most this many trading days at a time. */
export const SKIP_MAX_DAYS = 60;

export type NextEventKind = 'earnings' | 'exDividend' | 'headline' | 'lastDay';

/** Where "Next event" would stop: paused at the close of `stopDay`, before the event. */
export interface NextEvent {
  kind: NextEventKind;
  /** The day it happens (earnings and dividends at the open, headlines during the day). */
  day: number;
  stopDay: number;
  ticker: string | null;
}

const KIND_ORDER: Record<NextEventKind, number> = {
  earnings: 0,
  exDividend: 1,
  headline: 2,
  lastDay: 3,
};

/**
 * The next event worth stopping before, from a clock position: earnings or an ex-dividend date
 * of a followed ticker, a scenario headline, or the run's last close. Only dates the player
 * could know are used (report dates are public; results and company news are not). Null when
 * nothing is due within `SKIP_MAX_DAYS`.
 */
export function nextEvent(
  m: BuiltMarket,
  day: number,
  atClose: boolean,
  followed: ReadonlySet<string>,
): NextEvent | null {
  const last = m.dates.length - 1;
  // The stop (the close before the event) must still be ahead of the clock.
  const first = day + (atClose ? 2 : 1);
  const limit = day + SKIP_MAX_DAYS;
  const found: NextEvent[] = [];
  const consider = (e: NextEvent) => {
    if (e.stopDay <= limit) found.push(e);
  };
  for (let k = m.eventIndex[first] ?? m.events.length; k < m.events.length; k++) {
    const e = m.events[k];
    if (!e || e.day > limit + 1) break;
    if (e.kind === 'headline' || (e.kind === 'earnings' && e.ticker && followed.has(e.ticker))) {
      consider({ kind: e.kind, day: e.day, stopDay: e.day - 1, ticker: e.ticker });
      break;
    }
  }
  for (const d of m.dividends) {
    if (d.day > limit + 1) break;
    if (d.day >= first && followed.has(d.ticker)) {
      consider({ kind: 'exDividend', day: d.day, stopDay: d.day - 1, ticker: d.ticker });
      break;
    }
  }
  if (!(atClose && day >= last))
    consider({ kind: 'lastDay', day: last, stopDay: last, ticker: null });
  found.sort((a, b) => a.stopDay - b.stopDay || KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
  return found[0] ?? null;
}

/** Short name of an event for buttons and notices: "NVDA earnings", "market news". */
export function nextEventLabel(e: NextEvent): string {
  switch (e.kind) {
    case 'earnings':
      return `${e.ticker} earnings`;
    case 'exDividend':
      return `${e.ticker} ex-dividend`;
    case 'headline':
      return 'market news';
    case 'lastDay':
      return 'last day';
  }
}
