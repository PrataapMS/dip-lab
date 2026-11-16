import { childSeed, createRng, normal } from './rng';
import { REFERENCE_MARKET_VOL } from './regimes';
import { TRADING_DAYS_PER_YEAR } from './synthetic';

export const SECTORS = [
  'Information Technology',
  'Health Care',
  'Financials',
  'Consumer Discretionary',
  'Communication Services',
  'Industrials',
  'Consumer Staples',
  'Energy',
  'Utilities',
  'Real Estate',
  'Materials',
] as const;
export type Sector = (typeof SECTORS)[number];

export function isSector(value: unknown): value is Sector {
  return typeof value === 'string' && (SECTORS as readonly string[]).includes(value);
}

/** Annual volatility of a sector factor on top of the market, at reference market vol. */
export const SECTOR_VOL = 0.1;
/** Smallest stock-specific volatility, so no stock is a pure copy of its factors. */
export const MIN_IDIO_VOL = 0.08;

const DT = 1 / TRADING_DAYS_PER_YEAR;
const SQRT_DT = Math.sqrt(DT);

/** Daily market factor that stocks load on. */
export interface MarketFactor {
  /** Annualised market volatility per day. */
  vols: readonly number[];
  /** Daily log return per day. */
  returns: readonly number[];
}

/** How much busier a day is than normal; sector and stock noise scale with it. */
function stress(marketVol: number): number {
  return marketVol / REFERENCE_MARKET_VOL;
}

/**
 * Zero-mean daily log shocks of one sector factor. Sector noise scales with market
 * volatility, so sectors get choppier in crashes too.
 */
export function sectorShocks(seed: number, sector: Sector, marketVols: readonly number[]): number[] {
  const rand = createRng(childSeed(seed, `sector:${sector}`));
  return marketVols.map((v) => SECTOR_VOL * stress(v) * SQRT_DT * normal(rand));
}

export interface StockParams {
  ticker: string;
  /** Sensitivity to the market factor. */
  beta: number;
  /** Total annual volatility at reference market conditions. */
  vol: number;
  sector: Sector | null;
  /** Sensitivity to the sector factor. Default 1. */
  sectorLoading?: number;
  /** Override stock-specific volatility (ETFs use a tiny value). */
  idioVol?: number;
  /** Expected company-news jumps per year (earnings come on top). Default 1.5. */
  jumpsPerYear?: number;
}

/** Stock-specific volatility: whatever is left of total vol after market and sector. */
export function idioVolFor(p: StockParams): number {
  if (p.idioVol !== undefined) return p.idioVol;
  const s = p.sector ? (p.sectorLoading ?? 1) : 0;
  const left = p.vol * p.vol - p.beta * p.beta * REFERENCE_MARKET_VOL ** 2 - s * s * SECTOR_VOL ** 2;
  return Math.sqrt(Math.max(left, MIN_IDIO_VOL ** 2));
}

/** Typical size (sd of the log move) of a news jump for a stock of this volatility. */
export function jumpSize(vol: number): number {
  return 0.03 + 0.1 * vol;
}

export interface StockPath {
  /** Start price, then one close per day (days + 1 values). */
  closes: Float64Array;
  /** Total log jump on each day (news plus scheduled), 0 for none. Jumps land overnight as gaps. */
  jumps: Float64Array;
  /** The random company-news part of `jumps`. */
  news: Float64Array;
}

export interface PathExtras {
  /** Log jumps known in advance (earnings, ex-dividend drops), one per day. */
  scheduled?: ArrayLike<number>;
  /** Multiplies the company-news rate (0 turns news off). Default 1. */
  newsScale?: number;
}

export const DEFAULT_NEWS_PER_YEAR = 1.5;

/**
 * Daily closes for one stock:
 * r = beta * r_market + loading * r_sector + own noise + news jump.
 * Own noise scales with the square root of market stress.
 */
export function generateStockPath(
  seed: number,
  p: StockParams,
  startPrice: number,
  market: MarketFactor,
  sectorReturns: readonly number[] | null,
  extras: PathExtras = {},
): StockPath {
  const days = market.returns.length;
  const rand = createRng(childSeed(seed, `stock:${p.ticker}`));
  const loading = p.sector && sectorReturns ? (p.sectorLoading ?? 1) : 0;
  const idio = idioVolFor(p);
  const jumpProb = (p.jumpsPerYear ?? DEFAULT_NEWS_PER_YEAR) * (extras.newsScale ?? 1) * DT;
  const jumpSd = jumpSize(p.vol);
  const closes = new Float64Array(days + 1);
  const jumps = new Float64Array(days);
  const news = new Float64Array(days);
  let logPrice = Math.log(startPrice);
  closes[0] = startPrice;
  for (let t = 0; t < days; t++) {
    const sigma = idio * Math.sqrt(stress(market.vols[t] ?? REFERENCE_MARKET_VOL));
    const own = -0.5 * sigma * sigma * DT + sigma * SQRT_DT * normal(rand);
    // Always draw both jump numbers so every stream advances the same way each day.
    const hit = rand() < jumpProb;
    const size = normal(rand) * jumpSd;
    news[t] = hit ? size : 0;
    const jump = (news[t] ?? 0) + (extras.scheduled?.[t] ?? 0);
    jumps[t] = jump;
    logPrice += p.beta * (market.returns[t] ?? 0) + loading * (sectorReturns?.[t] ?? 0) + own + jump;
    closes[t + 1] = Math.exp(logPrice);
  }
  return { closes, jumps, news };
}
