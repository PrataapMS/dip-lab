import { describe, expect, it } from 'vitest';
import { rebased } from './CompareChart';

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
});
