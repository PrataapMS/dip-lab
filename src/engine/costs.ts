import { REFERENCE_MARKET_VOL } from './regimes';

/** What trading costs: a bid-ask spread on every fill, plus an optional flat commission. */
export interface CostModel {
  /** Flat dollars per trade. */
  commission: number;
  /** Whether fills pay the bid-ask spread. */
  spreadOn: boolean;
}

/** Half-spread for an ETF in calm markets, in basis points. */
const ETF_HALF_SPREAD_BPS = 1;
/** A stock's half-spread is BASE + PER_VOL * annual vol (vol 0.3 gives 3.4 bps). */
const STOCK_BASE_BPS = 1;
const STOCK_PER_VOL_BPS = 8;

/**
 * Half the bid-ask spread as a fraction of price. Wider for volatile stocks, and wider for
 * everything when the market is stressed (spreads blow out in crashes).
 */
export function halfSpread(
  inst: { kind: 'stock' | 'etf'; vol: number },
  marketVol: number,
  costs: Pick<CostModel, 'spreadOn'>,
): number {
  if (!costs.spreadOn) return 0;
  const bps = inst.kind === 'etf' ? ETF_HALF_SPREAD_BPS : STOCK_BASE_BPS + STOCK_PER_VOL_BPS * inst.vol;
  const stress = Math.max(1, marketVol / REFERENCE_MARKET_VOL);
  return (bps * stress) / 10_000;
}

/** Price the player gets: buys pay up by half the spread, sells receive half the spread less. */
export function fillPrice(mid: number, side: 'buy' | 'sell', half: number): number {
  return side === 'buy' ? mid * (1 + half) : mid * (1 - half);
}
