import type { InstrumentInfo } from '../engine/protocol';

export const INDEX_TILES: { ticker: string; label: string }[] = [
  { ticker: 'SPY', label: 'S&P 500' },
  { ticker: 'QQQ', label: 'NASDAQ' },
  { ticker: 'DIA', label: 'DOW' },
  { ticker: 'IWM', label: 'SMALL CAP' },
];

/** Sector chips: short label → sector name ('etf' for funds). */
export const SECTOR_CHIPS: { label: string; sector: string }[] = [
  { label: 'tech', sector: 'Information Technology' },
  { label: 'health', sector: 'Health Care' },
  { label: 'finance', sector: 'Financials' },
  { label: 'consumer', sector: 'Consumer Discretionary' },
  { label: 'comms', sector: 'Communication Services' },
  { label: 'industrial', sector: 'Industrials' },
  { label: 'staples', sector: 'Consumer Staples' },
  { label: 'energy', sector: 'Energy' },
  { label: 'utilities', sector: 'Utilities' },
  { label: 'real estate', sector: 'Real Estate' },
  { label: 'materials', sector: 'Materials' },
  { label: 'funds', sector: 'etf' },
];

/** Ticker prefix matches first, then name matches (word starts), up to `limit`. */
export function searchInstruments(
  instruments: readonly InstrumentInfo[],
  query: string,
  limit = 30,
): InstrumentInfo[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const exact: InstrumentInfo[] = [];
  const ticker: InstrumentInfo[] = [];
  const name: InstrumentInfo[] = [];
  for (const inst of instruments) {
    const t = inst.ticker.toLowerCase();
    if (t === q) exact.push(inst);
    else if (t.startsWith(q)) ticker.push(inst);
    else if (
      inst.name
        .toLowerCase()
        .split(/[\s.&,-]+/)
        .some((w) => w.startsWith(q)) ||
      inst.name.toLowerCase().startsWith(q)
    )
      name.push(inst);
  }
  return [...exact, ...ticker, ...name].slice(0, limit);
}

export function inSector(inst: InstrumentInfo, sector: string): boolean {
  return sector === 'etf' ? inst.kind === 'etf' : inst.kind === 'stock' && inst.sector === sector;
}

/** Day change as a fraction for each instrument index. */
export function dayChange(
  prices: ArrayLike<number>,
  prevCloses: ArrayLike<number>,
  i: number,
): number {
  const p = prices[i] ?? 0;
  const pc = prevCloses[i] ?? 0;
  return pc > 0 && p > 0 ? p / pc - 1 : 0;
}

/** Biggest gainers and losers among stocks today. */
export function topMovers(
  instruments: readonly InstrumentInfo[],
  prices: ArrayLike<number>,
  prevCloses: ArrayLike<number>,
  count = 5,
): { up: string[]; down: string[] } {
  const rows = instruments
    .map((inst, i) => ({
      ticker: inst.ticker,
      kind: inst.kind,
      change: dayChange(prices, prevCloses, i),
    }))
    .filter((r) => r.kind === 'stock');
  rows.sort((a, b) => b.change - a.change || a.ticker.localeCompare(b.ticker));
  return {
    up: rows.slice(0, count).map((r) => r.ticker),
    down: rows
      .slice(-count)
      .reverse()
      .map((r) => r.ticker),
  };
}
