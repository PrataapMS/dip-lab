import { describe, expect, it } from 'vitest';
import { cleanSlotRewards, keepFilled, setSlotRewards } from './runRewards';

const badge = { source: 'badge' as const, label: 'First trade', xp: 50, id: 'first-trade' };

describe('rewards per save slot', () => {
  it('cleans saved records', () => {
    expect(cleanSlotRewards(undefined, 3)).toEqual([null, null, null]);
    expect(
      cleanSlotRewards(
        [
          { levelBefore: 2, rewards: [badge, { source: 'nope', label: 'x', xp: 1 }, 7] },
          { levelBefore: 'x', rewards: [] },
          null,
          { levelBefore: 1, rewards: [] },
        ],
        3,
      ),
    ).toEqual([{ levelBefore: 2, rewards: [badge] }, null, null]);
  });

  it('sets one slot and forgets emptied ones', () => {
    const all = setSlotRewards([null, null, null], 1, { levelBefore: 3, rewards: [badge] });
    expect(all[1]?.rewards).toEqual([badge]);
    expect(setSlotRewards(all, 5, null)).toBe(all);
    expect(keepFilled(all, [{}, {}, null])).toBe(all);
    expect(keepFilled(all, [{}, null, null])).toEqual([null, null, null]);
  });
});
