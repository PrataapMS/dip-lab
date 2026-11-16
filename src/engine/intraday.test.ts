import { describe, expect, it } from 'vitest';
import { bridgeThrough } from './bridge';
import {
  BARS_PER_DAY,
  barTime,
  generateDayPath,
  INTRADAY_WEIGHTS,
  POINTS_PER_DAY,
} from './intraday';
import { createRng, normal } from './rng';

const day = { seed: 7, ticker: 'NVDA', day: 12, prevClose: 100, close: 103, annualVol: 0.4 };

describe('bridgeThrough', () => {
  it('passes exactly through every anchor', () => {
    const rand = createRng(1);
    const shocks = Array.from({ length: 100 }, () => 0.02 * normal(rand));
    const variances = Array.from({ length: 100 }, () => 0.0004);
    const anchors = [
      { at: 0, value: 0 },
      { at: 30, value: -0.5 },
      { at: 100, value: 0.2 },
    ];
    const path = bridgeThrough(shocks, variances, anchors);
    expect(path).toHaveLength(101);
    for (const a of anchors) expect(path[a.at]).toBeCloseTo(a.value, 12);
  });

  it('is a straight line when there is no noise', () => {
    const path = bridgeThrough(
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [
        { at: 0, value: 1 },
        { at: 4, value: 3 },
      ],
    );
    expect(Array.from(path)).toEqual([1, 1.5, 2, 2.5, 3]);
  });

  it('rejects anchors that do not cover the path', () => {
    expect(() => bridgeThrough([0, 0], [0, 0], [{ at: 0, value: 0 }])).toThrow();
  });
});

describe('intraday', () => {
  it('labels bars from the 9:30 open to the 16:00 close', () => {
    expect(barTime(0)).toBe('09:30');
    expect(barTime(1)).toBe('09:35');
    expect(barTime(BARS_PER_DAY)).toBe('16:00');
  });

  it('weights bars in a U shape that sums to 1', () => {
    const sum = INTRADAY_WEIGHTS.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 12);
    const mid = INTRADAY_WEIGHTS[39] ?? 0;
    expect(INTRADAY_WEIGHTS[0]).toBeGreaterThan(mid * 2);
    expect(INTRADAY_WEIGHTS[BARS_PER_DAY - 1]).toBeGreaterThan(mid * 2);
  });

  it('is deterministic per seed, ticker and day', () => {
    expect(generateDayPath(day)).toEqual(generateDayPath(day));
    expect(generateDayPath({ ...day, day: 13 }).points).not.toEqual(generateDayPath(day).points);
    expect(generateDayPath({ ...day, ticker: 'AMD' }).points).not.toEqual(
      generateDayPath(day).points,
    );
  });

  it('ends exactly at the day close with consistent highs and lows', () => {
    const { points, high, low } = generateDayPath(day);
    expect(points).toHaveLength(POINTS_PER_DAY);
    expect(points[BARS_PER_DAY]).toBe(103);
    for (let k = 0; k < BARS_PER_DAY; k++) {
      const o = points[k] ?? 0;
      const c = points[k + 1] ?? 0;
      expect(high[k]).toBeGreaterThanOrEqual(Math.max(o, c));
      expect(low[k]).toBeLessThanOrEqual(Math.min(o, c));
      expect(low[k]).toBeGreaterThan(0);
    }
  });

  it('shows a news jump as an overnight gap', () => {
    const { points } = generateDayPath({ ...day, close: 92, jump: Math.log(0.9) });
    const gap = Math.log((points[0] ?? 0) / 100);
    expect(gap).toBeLessThan(-0.08);
  });
});
