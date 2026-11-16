import { childSeed, createRng, normal, type Rng } from './rng';
import { TRADING_DAYS_PER_YEAR } from './synthetic';

/**
 * Market moods. Each regime sets the drift and the base volatility of the market factor;
 * a GARCH(1,1)-style multiplier on top makes volatile days cluster together.
 */
export type Regime = 'calm' | 'bull' | 'bear' | 'crash';
export const REGIMES: readonly Regime[] = ['calm', 'bull', 'bear', 'crash'];

export interface RegimeParams {
  /** Expected annual return. */
  annualDrift: number;
  /** Base annual volatility before clustering. */
  annualVol: number;
}

export const REGIME_PARAMS: Record<Regime, RegimeParams> = {
  calm: { annualDrift: 0.07, annualVol: 0.12 },
  bull: { annualDrift: 0.2, annualVol: 0.15 },
  bear: { annualDrift: -0.25, annualVol: 0.28 },
  crash: { annualDrift: -1.5, annualVol: 0.6 },
};

/**
 * Daily probability of moving from one regime (row) to another (column). Rows sum to 1.
 * Average stays: calm ~70 days, bull ~100, bear ~45, crash ~14.
 */
export const TRANSITIONS: Record<Regime, Record<Regime, number>> = {
  calm: { calm: 0.985, bull: 0.008, bear: 0.006, crash: 0.001 },
  bull: { calm: 0.006, bull: 0.99, bear: 0.003, crash: 0.001 },
  bear: { calm: 0.008, bull: 0.004, bear: 0.978, crash: 0.01 },
  crash: { calm: 0, bull: 0.02, bear: 0.05, crash: 0.93 },
};

/** GARCH(1,1) weights on the variance multiplier. Persistence = ALPHA + BETA. */
export const GARCH_ALPHA = 0.08;
export const GARCH_BETA = 0.9;

/** Long-run annual market volatility, used to scale sector and stock noise. */
export const REFERENCE_MARKET_VOL = 0.16;

const DT = 1 / TRADING_DAYS_PER_YEAR;

/** Walk the regime Markov chain for `days` days, starting in `start`. */
export function regimeChain(rand: Rng, days: number, start: Regime): Regime[] {
  const out: Regime[] = [];
  let current = start;
  for (let d = 0; d < days; d++) {
    out.push(current);
    const row = TRANSITIONS[current];
    let u = rand();
    for (const next of REGIMES) {
      u -= row[next];
      if (u < 0) {
        current = next;
        break;
      }
    }
  }
  return out;
}

export interface VolatilityPath {
  /** Annualised volatility for each day, after clustering. */
  vols: number[];
  /** Zero-mean daily log shock for each day: vol * sqrt(dt) * z. */
  shocks: number[];
}

/**
 * Volatility with clustering: a variance multiplier m (mean 1) follows
 * m[t] = (1 - a - b) + a * m[t-1] * z[t-1]^2 + b * m[t-1], and the day's vol is
 * baseVol[t] * sqrt(m[t]). Big shocks raise tomorrow's vol, which then decays.
 */
export function volatilityPath(rand: Rng, baseVols: readonly number[]): VolatilityPath {
  const vols: number[] = [];
  const shocks: number[] = [];
  let m = 1;
  let prevZ = 0;
  for (let t = 0; t < baseVols.length; t++) {
    if (t > 0) m = 1 - GARCH_ALPHA - GARCH_BETA + GARCH_ALPHA * m * prevZ * prevZ + GARCH_BETA * m;
    // Keep extreme streaks inside a believable band.
    m = Math.min(Math.max(m, 0.25), 6);
    const vol = (baseVols[t] ?? 0) * Math.sqrt(m);
    const z = normal(rand);
    vols.push(vol);
    shocks.push(vol * Math.sqrt(DT) * z);
    prevZ = z;
  }
  return { vols, shocks };
}

export interface MarketDays {
  regimes: Regime[];
  /** Annualised market volatility per day. */
  vols: number[];
  /** Daily log return of the market factor. */
  returns: number[];
}

export interface MarketDaysOptions {
  seed: number;
  days: number;
  /** Regime on day 0. Defaults to calm. */
  start?: Regime;
  /** Fixed regime per day instead of the Markov chain (used by scenarios). */
  regimes?: readonly Regime[];
}

/** Free-running market factor: regime chain, clustered volatility and regime drift. */
export function generateMarketDays(opts: MarketDaysOptions): MarketDays {
  const { seed, days } = opts;
  const regimes = opts.regimes
    ? opts.regimes.slice(0, days)
    : regimeChain(createRng(childSeed(seed, 'regime')), days, opts.start ?? 'calm');
  const base = regimes.map((r) => REGIME_PARAMS[r].annualVol);
  const { vols, shocks } = volatilityPath(createRng(childSeed(seed, 'market')), base);
  const returns = regimes.map((r, t) => {
    const vol = vols[t] ?? 0;
    return (REGIME_PARAMS[r].annualDrift - 0.5 * vol * vol) * DT + (shocks[t] ?? 0);
  });
  return { regimes, vols, returns };
}
