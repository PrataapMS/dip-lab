import type { MarketEvent } from './events';

/**
 * Wording for earnings and company news. Headlines use tickers and made-up reasons: the news,
 * like the prices, is simulated and says nothing about the real company.
 */
const NEWS_UP = [
  '{T} wins a major contract',
  '{T} unveils a new product line',
  'Analysts upgrade {T}',
  '{T} announces a share buyback',
  '{T} raises its full-year outlook',
  'Takeover talk lifts {T}',
  '{T} gets a key approval',
];

const NEWS_DOWN = [
  'Analysts downgrade {T}',
  '{T} faces a regulator probe',
  '{T} recalls a product',
  '{T} CEO steps down unexpectedly',
  '{T} cuts its outlook',
  'Lawsuit weighs on {T}',
  '{T} loses a major customer',
];

/** "+6.2%" or "−3.1%" for a log move. */
export function movePct(move: number): string {
  const pct = (Math.exp(move) - 1) * 100;
  const sign = pct >= 0 ? '+' : '−';
  return `${sign}${Math.abs(pct).toFixed(1)}%`;
}

function earningsText(t: string, e: MarketEvent): string {
  const pct = movePct(e.move);
  switch (e.result) {
    case 'beat':
      return e.move >= 0 ? `${t} beats estimates, shares ${pct}` : `${t} beats estimates but guidance disappoints, shares ${pct}`;
    case 'miss':
      return e.move < 0 ? `${t} misses estimates, shares ${pct}` : `${t} misses estimates but outlook lifts shares ${pct}`;
    default:
      return `${t} results in line with estimates, shares ${pct}`;
  }
}

export function eventText(e: MarketEvent): string {
  if (e.text !== undefined) return e.text;
  const t = e.ticker ?? 'Market';
  if (e.kind === 'earnings') return earningsText(t, e);
  const list = e.move >= 0 ? NEWS_UP : NEWS_DOWN;
  const base = (list[e.variant % list.length] ?? list[0] ?? '{T}').replace('{T}', t);
  return `${base}, shares ${movePct(e.move)}`;
}
