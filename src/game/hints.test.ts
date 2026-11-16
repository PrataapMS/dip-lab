import { describe, expect, it } from 'vitest';
import type { Activity } from '../engine/activity';
import { orderXpHint } from './hints';
import { emptyProgress } from './progress';
import { questsFor } from './quests';

const fill: Activity = {
  kind: 'fill',
  ticker: 'KO',
  side: 'buy',
  orderType: 'market',
  etf: false,
  short: false,
  forced: false,
  realised: 0,
  day: 0,
};

describe('order XP hint', () => {
  it('shows the first-trade XP until the badge is earned', () => {
    expect(orderXpHint(emptyProgress(), '2026-11-16', [fill])).toBe('+50 XP · first trade');
    const p = { ...emptyProgress(), badges: { 'first-trade': '2026-11-16' } };
    expect(
      orderXpHint(p, '2026-11-16', [
        { kind: 'order', type: 'market', side: 'buy', ticker: 'KO', short: false },
        fill,
      ]),
    ).toBeNull();
  });

  it('shows quest XP only when the order would finish a quest', () => {
    // Find a day whose trading quest is "Place a limit order".
    let date = '';
    for (let d = 1; d <= 28 && !date; d++) {
      const day = `2026-03-${String(d).padStart(2, '0')}`;
      if (questsFor(day)[1]?.id === 'limit') date = day;
    }
    expect(date).not.toBe('');
    const p = { ...emptyProgress(), badges: { 'first-trade': date } };
    const limit: Activity = {
      kind: 'order',
      type: 'limit',
      side: 'buy',
      ticker: 'KO',
      short: false,
    };
    expect(orderXpHint(p, date, [limit])).toBe('+50 XP · quest');
    expect(orderXpHint(p, date, [{ ...limit, type: 'market' }])).toBeNull();
    const claimed = { ...p, quests: { date, progress: [0, 1, 0], claimed: [false, true, false] } };
    expect(orderXpHint(claimed, date, [limit])).toBeNull();
  });
});
