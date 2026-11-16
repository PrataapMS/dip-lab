import { bridgeThrough } from './bridge';
import { childSeed, createRng, normal } from './rng';
import { TRADING_DAYS_PER_YEAR } from './synthetic';

/** 9:30 to 16:00 in five-minute bars. */
export const BARS_PER_DAY = 78;
/** The open plus the close of every bar. */
export const POINTS_PER_DAY = BARS_PER_DAY + 1;
export const BAR_MINUTES = 5;
const OPEN_MINUTE = 9 * 60 + 30;

/** Clock time after `bar` bars (0 = the 9:30 open, 78 = the 16:00 close), as "HH:MM". */
export function barTime(bar: number): string {
  const minutes = OPEN_MINUTE + bar * BAR_MINUTES;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Share of the day's variance in each bar. U-shaped: trading is busiest just after the
 * open and just before the close. Sums to 1.
 */
export const INTRADAY_WEIGHTS: Float64Array = (() => {
  const w = new Float64Array(BARS_PER_DAY);
  const mid = (BARS_PER_DAY - 1) / 2;
  let sum = 0;
  for (let k = 0; k < BARS_PER_DAY; k++) {
    const x = (k - mid) / mid;
    w[k] = 1 + 1.5 * x * x;
    sum += w[k] ?? 0;
  }
  for (let k = 0; k < BARS_PER_DAY; k++) w[k] = (w[k] ?? 0) / sum;
  return w;
})();

/** Share of a normal day's move that already shows at the open. */
const OVERNIGHT_SHARE = 0.15;
/** Overnight noise, as a share of daily volatility. */
const OVERNIGHT_NOISE = 0.2;
/** Intraday variance, as a share of daily variance (the rest happened overnight). */
const INTRADAY_VAR_SHARE = 0.85;

export interface DayPathInput {
  seed: number;
  ticker: string;
  /** Trading-day index within the run. */
  day: number;
  prevClose: number;
  close: number;
  /** Annualised volatility for this stock on this day. */
  annualVol: number;
  /** Log news jump for the day; it shows as an overnight gap. */
  jump?: number;
}

export interface DayPath {
  /** Open, then the close of each bar. The last point is the day's close. */
  points: Float64Array;
  /** High and low of each bar. */
  high: Float64Array;
  low: Float64Array;
}

/**
 * One trading day of 5-minute prices: an overnight gap to the open (carrying any news
 * jump), then a Brownian bridge to the day's known close. Seeded per (seed, ticker, day),
 * so any day can be rebuilt on demand without replaying the days before it.
 */
export function generateDayPath(input: DayPathInput): DayPath {
  const { prevClose, close, annualVol } = input;
  const jump = input.jump ?? 0;
  const rand = createRng(childSeed(input.seed, `day:${input.ticker}:${input.day}`));
  const dailySd = annualVol / Math.sqrt(TRADING_DAYS_PER_YEAR);
  const total = Math.log(close / prevClose);
  const overnight =
    jump + OVERNIGHT_SHARE * (total - jump) + OVERNIGHT_NOISE * dailySd * normal(rand);
  const logOpen = Math.log(prevClose) + overnight;
  const logClose = Math.log(close);

  const dayVar = INTRADAY_VAR_SHARE * dailySd * dailySd;
  const variances = new Float64Array(BARS_PER_DAY);
  const shocks = new Float64Array(BARS_PER_DAY);
  for (let k = 0; k < BARS_PER_DAY; k++) {
    const v = (INTRADAY_WEIGHTS[k] ?? 0) * dayVar;
    variances[k] = v;
    shocks[k] = Math.sqrt(v) * normal(rand);
  }
  const logPath = bridgeThrough(shocks, variances, [
    { at: 0, value: logOpen },
    { at: BARS_PER_DAY, value: logClose },
  ]);

  const points = logPath.map(Math.exp);
  // Exact close: the bridge pins it, exp() of the log can be off in the last bit.
  points[BARS_PER_DAY] = close;
  const high = new Float64Array(BARS_PER_DAY);
  const low = new Float64Array(BARS_PER_DAY);
  for (let k = 0; k < BARS_PER_DAY; k++) {
    const o = points[k] ?? close;
    const c = points[k + 1] ?? close;
    const sd = Math.sqrt(variances[k] ?? 0);
    high[k] = Math.max(o, c) * Math.exp(0.5 * sd * Math.abs(normal(rand)));
    low[k] = Math.min(o, c) * Math.exp(-0.5 * sd * Math.abs(normal(rand)));
  }
  return { points, high, low };
}
