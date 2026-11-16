import { eventText } from './headlines';
import { eventsOn } from './market';
import type { Run } from './run';

/** A holding's move over one day. */
export interface DayMove {
  ticker: string;
  /** Fraction, e.g. 0.031 for +3.1%. */
  pct: number;
}

/** What happened today, shown at the close. Plain data, safe to post from the worker. */
export interface DaySummary {
  day: number;
  date: string;
  value: number;
  /** Signed change in account value since the previous close. */
  change: number;
  changePct: number;
  /** SPY's move today, dividends included. */
  spyPct: number;
  best: DayMove | null;
  worst: DayMove | null;
  trades: number;
  dividends: number;
  /** Today's main headline, or the biggest news about a holding. */
  headline: string | null;
  /** Holdings that report earnings before tomorrow's open. */
  reportsTomorrow: string[];
}

/** Summary of the day that just closed (call at bar 78). */
export function daySummary(run: Run): DaySummary {
  const m = run.market;
  const a = run.account;
  const day = run.clock.day;
  const start = a.settings.startingCash;
  const value = a.equityByDay[day] ?? run.marks().value;
  const prev = day > 0 ? (a.equityByDay[day - 1] ?? start) : start;

  const moves: DayMove[] = [];
  for (const ticker of Object.keys(a.positions)) {
    const i = run.indexOf(ticker);
    const closes = i === undefined ? undefined : m.closes[i];
    const before = closes?.[day] ?? 0;
    if (before > 0) moves.push({ ticker, pct: (closes?.[day + 1] ?? before) / before - 1 });
  }
  moves.sort((x, y) => y.pct - x.pct || x.ticker.localeCompare(y.ticker));
  const best = moves[0] ?? null;
  const worst = moves.length > 1 ? (moves[moves.length - 1] ?? null) : null;

  const today = eventsOn(m, day);
  const held = (t: string | null) => !!t && (a.positions[t]?.shares ?? 0) > 0;
  const headline =
    today.filter((e) => e.kind === 'headline').at(-1) ??
    today.filter((e) => held(e.ticker)).sort((x, y) => Math.abs(y.move) - Math.abs(x.move))[0];
  const reportsTomorrow = eventsOn(m, day + 1)
    .filter((e) => e.kind === 'earnings' && held(e.ticker))
    .map((e) => e.ticker ?? '');

  const spyBefore = run.indexClose(day);
  return {
    day,
    date: m.dates[day] ?? '',
    value,
    change: value - prev,
    changePct: prev ? value / prev - 1 : 0,
    spyPct: spyBefore ? run.indexClose(day + 1) / spyBefore - 1 : 0,
    best,
    worst,
    trades: a.fills.filter((f) => f.at.day === day).length,
    dividends: a.dividends.filter((d) => d.at.day === day).reduce((s, d) => s + d.amount, 0),
    headline: headline ? eventText(headline) : null,
    reportsTomorrow,
  };
}
