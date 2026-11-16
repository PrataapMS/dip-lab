import { describe, expect, it } from 'vitest';
import { createRng } from './rng';
import {
  generateMarketDays,
  type Regime,
  REGIMES,
  regimeChain,
  TRANSITIONS,
  volatilityPath,
} from './regimes';

function autocorr(xs: number[], lag: number): number {
  const n = xs.length;
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const d = (xs[i] ?? 0) - mean;
    den += d * d;
    if (i >= lag) num += d * ((xs[i - lag] ?? 0) - mean);
  }
  return num / den;
}

describe('regimes', () => {
  it('has transition rows that sum to 1', () => {
    for (const r of REGIMES) {
      const sum = REGIMES.reduce((acc, next) => acc + TRANSITIONS[r][next], 0);
      expect(sum).toBeCloseTo(1, 10);
    }
  });

  it('is deterministic for a seed', () => {
    const opts = { seed: 11, days: 500 };
    expect(generateMarketDays(opts)).toEqual(generateMarketDays(opts));
    expect(generateMarketDays({ seed: 12, days: 500 }).returns).not.toEqual(
      generateMarketDays(opts).returns,
    );
  });

  it('visits every regime over a long run', () => {
    const chain = regimeChain(createRng(5), 20_000, 'calm');
    for (const r of REGIMES) expect(chain).toContain(r);
  });

  it('uses fixed regimes when given', () => {
    const regimes = Array.from({ length: 50 }, (_, i): Regime => (i < 25 ? 'calm' : 'crash'));
    const m = generateMarketDays({ seed: 3, days: 50, regimes });
    expect(m.regimes).toEqual(regimes);
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(avg(m.vols.slice(25))).toBeGreaterThan(avg(m.vols.slice(0, 25)) * 2);
  });

  it('clusters volatility: squared shocks are autocorrelated, raw shocks are not', () => {
    const base = Array.from({ length: 20_000 }, () => 0.2);
    const { shocks } = volatilityPath(createRng(99), base);
    const squared = shocks.map((s) => s * s);
    expect(autocorr(squared, 1)).toBeGreaterThan(0.05);
    expect(Math.abs(autocorr(shocks, 1))).toBeLessThan(0.03);
  });

  it('keeps average volatility near the base level', () => {
    const base = Array.from({ length: 20_000 }, () => 0.2);
    const { vols } = volatilityPath(createRng(7), base);
    const meanVar = vols.reduce((a, v) => a + v * v, 0) / vols.length;
    expect(Math.sqrt(meanVar)).toBeGreaterThan(0.17);
    expect(Math.sqrt(meanVar)).toBeLessThan(0.23);
  });
});
