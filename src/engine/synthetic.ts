import { createRng, normal } from './rng';

export const TRADING_DAYS_PER_YEAR = 252;

export interface PathOptions {
  seed: number;
  start: number;
  days: number;
  /** Expected annual return, e.g. 0.08 for 8%. */
  annualDrift: number;
  /** Annual volatility, e.g. 0.2 for 20%. */
  annualVol: number;
}

/**
 * Daily closes from geometric Brownian motion. This is the seed of the Synthetic
 * data mode; regimes, sector factors and events layer on top of it in phase 1.
 * Returns days + 1 values: the start price, then one close per day.
 */
export function generateDailyCloses(opts: PathOptions): number[] {
  const { seed, start, days, annualDrift, annualVol } = opts;
  const rand = createRng(seed);
  const dt = 1 / TRADING_DAYS_PER_YEAR;
  const drift = (annualDrift - 0.5 * annualVol * annualVol) * dt;
  const shock = annualVol * Math.sqrt(dt);
  const closes = [start];
  let price = start;
  for (let d = 0; d < days; d++) {
    price *= Math.exp(drift + shock * normal(rand));
    closes.push(price);
  }
  return closes;
}
