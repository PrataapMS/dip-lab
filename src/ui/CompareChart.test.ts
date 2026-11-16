import { describe, expect, it } from 'vitest';
import { rebased, thinned } from './CompareChart';

describe('rebased curves', () => {
  it('lines up the account and SPY mid-day', () => {
    // Day 2, mid-session: two closes recorded, SPY has the start plus two closes.
    const r = rebased(10_000, [10_100, 10_200], 10_300, [50, 51, 52], 53, 2);
    expect(r.you).toEqual([100, 101, 102, 103]);
    expect(r.spy).toEqual([100, 102, 104, 106]);
  });

  it('does not double-count the close that was just recorded', () => {
    // Day 2 at the close: its value is already in equityByDay.
    const r = rebased(10_000, [10_100, 10_200, 10_300], 10_300, [50, 51, 52], 53, 2);
    expect(r.you).toHaveLength(r.spy.length);
  });

  it('thins long curves but keeps the ends, the lows and the highs', () => {
    expect(thinned([1, 2, 3])).toEqual([0, 1, 2]);
    const vals = Array.from({ length: 2_500 }, (_, i) => 100 + Math.sin(i / 40) * 10);
    vals[1_234] = 50;
    vals[2_000] = 150;
    const keep = thinned(vals);
    expect(keep.length).toBeLessThanOrEqual(400);
    expect(keep[0]).toBe(0);
    expect(keep.at(-1)).toBe(2_499);
    expect(keep).toContain(1_234);
    expect(keep).toContain(2_000);
    expect([...keep].sort((a, b) => a - b)).toEqual(keep);
  });
});
