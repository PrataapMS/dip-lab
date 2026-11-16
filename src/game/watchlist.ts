/**
 * The player's watchlist: one list across runs, kept in settings (and so in backups). Pure.
 * A scenario only shows the names listed in its start year; names not listed yet are swapped
 * for stand-ins from long-standing large companies, one for one.
 */

export const DEFAULT_WATCHLIST: readonly string[] = [
  'AAPL',
  'MSFT',
  'NVDA',
  'AMZN',
  'GOOGL',
  'TSLA',
  'JPM',
  'KO',
];

export const WATCHLIST_MAX = 20;

/** Long-standing large companies, standing in for names a scenario doesn't list yet. */
const STAND_INS = [
  'XOM',
  'JNJ',
  'WMT',
  'PG',
  'GE',
  'IBM',
  'INTC',
  'CSCO',
  'ORCL',
  'PFE',
  'BAC',
  'HD',
  'MRK',
  'PEP',
  'DIS',
  'MCD',
  'CVX',
];

/** At most this many stand-ins, so a long list of new names doesn't fill up with old ones. */
const STAND_IN_MAX = DEFAULT_WATCHLIST.length;

const TICKER = /^[A-Z][A-Z0-9.]{0,5}$/;

/** A saved list cleaned up: known shape, no repeats, at most `WATCHLIST_MAX`. */
export function cleanWatchlist(saved: unknown): string[] | null {
  if (!Array.isArray(saved)) return null;
  const out: string[] = [];
  for (const t of saved)
    if (typeof t === 'string' && TICKER.test(t) && !out.includes(t) && out.length < WATCHLIST_MAX)
      out.push(t);
  return out;
}

export function isWatched(list: readonly string[], ticker: string): boolean {
  return list.includes(ticker);
}

/** Adds the ticker at the end, or removes it. A full list stays as it is. */
export function toggleWatch(list: readonly string[], ticker: string): string[] {
  if (list.includes(ticker)) return list.filter((t) => t !== ticker);
  return list.length >= WATCHLIST_MAX ? [...list] : [...list, ticker];
}

/** Moves the ticker one place up (-1) or down (+1); at either end nothing changes. */
export function moveWatch(list: readonly string[], ticker: string, by: -1 | 1): string[] {
  const i = list.indexOf(ticker);
  const j = i + by;
  const out = [...list];
  if (i < 0 || j < 0 || j >= list.length) return out;
  [out[i], out[j]] = [out[j] as string, out[i] as string];
  return out;
}

export interface ScenarioWatchlist {
  /** The player's names this scenario lists, in their order. */
  shown: string[];
  /** The player's names it doesn't list yet. */
  hidden: string[];
  /** Stand-ins for the hidden ones. */
  standIns: string[];
}

/** The watchlist as one scenario shows it, given the stocks it lists. */
export function watchlistFor(
  list: readonly string[],
  listed: ReadonlySet<string>,
): ScenarioWatchlist {
  const shown = list.filter((t) => listed.has(t));
  const hidden = list.filter((t) => !listed.has(t));
  const want = Math.min(hidden.length, Math.max(0, STAND_IN_MAX - shown.length));
  const standIns: string[] = [];
  for (const t of [...STAND_INS, ...listed]) {
    if (standIns.length >= want) break;
    if (listed.has(t) && !list.includes(t) && !standIns.includes(t)) standIns.push(t);
  }
  return { shown, hidden, standIns };
}
