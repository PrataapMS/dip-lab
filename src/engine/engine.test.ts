import { describe, expect, it } from 'vitest';
import { childSeed, createRng, normal } from './rng';
import { generateDailyCloses, TRADING_DAYS_PER_YEAR } from './synthetic';

describe('rng', () => {
  it('replays exactly from the same seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = Array.from({ length: 100 }, a);
    const seqB = Array.from({ length: 100 }, b);
    expect(seqA).toEqual(seqB);
  });

  it('gives different streams for different seeds', () => {
    expect(createRng(1)()).not.toEqual(createRng(2)());
  });

  it('stays within [0, 1)', () => {
    const r = createRng(7);
    for (let i = 0; i < 10_000; i++) {
      const x = r();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it('produces roughly standard normal draws', () => {
    const r = createRng(123);
    const n = 50_000;
    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < n; i++) {
      const z = normal(r);
      sum += z;
      sumSq += z * z;
    }
    const mean = sum / n;
    expect(Math.abs(mean)).toBeLessThan(0.02);
    expect(Math.abs(sumSq / n - mean * mean - 1)).toBeLessThan(0.03);
  });

  it('derives stable, distinct child seeds per key', () => {
    expect(childSeed(9, 'AAPL')).toBe(childSeed(9, 'AAPL'));
    expect(childSeed(9, 'AAPL')).not.toBe(childSeed(9, 'MSFT'));
    expect(childSeed(9, 'AAPL')).not.toBe(childSeed(10, 'AAPL'));
  });
});

describe('generateDailyCloses', () => {
  const base = {
    seed: 2008,
    start: 100,
    days: TRADING_DAYS_PER_YEAR,
    annualDrift: 0.08,
    annualVol: 0.2,
  };

  it('is deterministic for a seed', () => {
    expect(generateDailyCloses(base)).toEqual(generateDailyCloses(base));
  });

  it('returns the start price plus one close per day, all positive', () => {
    const closes = generateDailyCloses(base);
    expect(closes).toHaveLength(base.days + 1);
    expect(closes[0]).toBe(100);
    expect(closes.every((p) => p > 0)).toBe(true);
  });

  it('follows the drift exactly when volatility is zero', () => {
    const closes = generateDailyCloses({ ...base, annualVol: 0 });
    expect(closes.at(-1)).toBeCloseTo(100 * Math.exp(0.08), 6);
  });
});
