import { describe, expect, it } from 'vitest';
import { UNIVERSE } from '../data/universe';
import { type Activity, closeActivity, heldDays } from '../engine/activity';
import { BARS_PER_DAY } from '../engine/intraday';
import { buildMarket } from '../engine/market';
import { Run } from '../engine/run';
import { getScenario } from '../engine/scenarios';
import { applyActivity, emptyProgress } from './progress';
import { advanceQuests, msToMidnight, QUESTS, questsFor } from './quests';
import { currentStreak, dayBefore, markPlayed } from './streak';

const close = (over: Partial<Extract<Activity, { kind: 'close' }>> = {}): Activity => ({
  kind: 'close',
  day: 3,
  value: 10_100,
  prevValue: 10_000,
  dayPct: 0.01,
  spyPct: 0.005,
  holdings: [],
  dividends: 0,
  dividendTickers: [],
  earningsHeld: [],
  ...over,
});

describe('daily quests', () => {
  it('gives the same three quests for a date, one per tier', () => {
    const a = questsFor('2026-11-16');
    expect(a.map((q) => q.tier)).toEqual(['learn', 'trade', 'stretch']);
    expect(questsFor('2026-11-16').map((q) => q.id)).toEqual(a.map((q) => q.id));
    // Over a month the picks vary.
    const ids = new Set<string>();
    for (let d = 1; d <= 28; d++)
      for (const q of questsFor(`2026-02-${String(d).padStart(2, '0')}`)) ids.add(q.id);
    expect(ids.size).toBeGreaterThan(8);
  });

  it('has unique ids and never rewards a count of trades', () => {
    expect(new Set(QUESTS.map((q) => q.id)).size).toBe(QUESTS.length);
    for (const q of QUESTS) expect(q.text).not.toMatch(/\btrades?\b/i);
  });

  it('counts progress, completes once and resets the next day', () => {
    // Find a date whose learning quest is "Read 2 glossary cards".
    let date = '';
    for (let d = 1; d <= 60 && !date; d++) {
      const day = `2026-${d <= 31 ? '01' : '02'}-${String(d <= 31 ? d : d - 31).padStart(2, '0')}`;
      if (questsFor(day)[0]?.id === 'glossary-2') date = day;
    }
    expect(date).not.toBe('');
    const read: Activity = { kind: 'glossaryRead', term: 'spread' };
    const one = advanceQuests(null, date, read);
    expect(one.state.progress[0]).toBe(1);
    expect(one.completed).toEqual([]);
    const two = advanceQuests(one.state, date, read);
    expect(two.completed.map((q) => q.id)).toEqual(['glossary-2']);
    expect(two.state.claimed[0]).toBe(true);
    expect(advanceQuests(two.state, date, read).completed).toEqual([]);
    const tomorrow = advanceQuests(two.state, '2027-01-01', { kind: 'replay', day: 1 });
    expect(tomorrow.state.date).toBe('2027-01-01');
    expect(
      tomorrow.state.claimed.every((c) => !c || questsFor('2027-01-01')[2]?.id === 'replay'),
    ).toBe(true);
  });

  it('"max" quests keep the best value seen', () => {
    const hold = QUESTS.find((q) => q.id === 'hold-5');
    const h = (days: number) =>
      close({
        holdings: [
          {
            ticker: 'KO',
            sector: 'Consumer Staples',
            etf: false,
            shares: 1,
            value: 60,
            heldDays: days,
          },
        ],
      });
    expect(hold?.measure(h(3))).toBe(3);
    expect(hold?.measure(close())).toBe(0);
    const sectors = QUESTS.find((q) => q.id === 'sectors-3');
    expect(
      sectors?.measure(
        close({
          holdings: [
            {
              ticker: 'KO',
              sector: 'Consumer Staples',
              etf: false,
              shares: 1,
              value: 1,
              heldDays: 1,
            },
            {
              ticker: 'AAPL',
              sector: 'Information Technology',
              etf: false,
              shares: 1,
              value: 1,
              heldDays: 1,
            },
            { ticker: 'SPY', sector: null, etf: true, shares: 1, value: 1, heldDays: 1 },
          ],
        }),
      ),
    ).toBe(3);
  });

  it('pays quest XP through progress and counts it', () => {
    let p = emptyProgress();
    const date = '2026-11-16';
    const quest = questsFor(date)[0];
    const act: Activity = quest?.id.startsWith('glossary')
      ? { kind: 'glossaryRead', term: 'x' }
      : { kind: 'lessonDone', lesson: 'x' };
    let paid = 0;
    for (let k = 0; k < (quest?.goal ?? 1); k++) {
      const r = applyActivity(p, act, date);
      p = r.progress;
      paid += r.rewards.reduce((s, x) => s + x.xp, 0);
    }
    expect(paid).toBe(quest?.xp);
    expect(p.xp).toBe(quest?.xp);
    expect(p.counters.questsDone).toBe(1);
  });

  it('counts down to local midnight', () => {
    expect(msToMidnight(new Date(2026, 10, 16, 23, 59, 0))).toBe(60_000);
  });
});

describe('streaks', () => {
  it('grows on consecutive days and resets after a gap', () => {
    expect(dayBefore('2026-03-01')).toBe('2026-02-28');
    expect(dayBefore('2026-01-01')).toBe('2025-12-31');
    let s = { count: 0, best: 0, last: null as string | null };
    s = markPlayed(s, '2026-11-14');
    s = markPlayed(s, '2026-11-15');
    s = markPlayed(s, '2026-11-15');
    s = markPlayed(s, '2026-11-16');
    expect(s).toEqual({ count: 3, best: 3, last: '2026-11-16' });
    expect(currentStreak(s, '2026-11-17')).toBe(3);
    expect(currentStreak(s, '2026-11-18')).toBe(0);
    s = markPlayed(s, '2026-11-20');
    expect(s).toEqual({ count: 1, best: 3, last: '2026-11-20' });
  });

  it('counts a played close or a finished lesson, not reading the glossary', () => {
    const date = '2026-11-16';
    expect(applyActivity(emptyProgress(), close(), date).progress.streak.count).toBe(1);
    expect(
      applyActivity(emptyProgress(), { kind: 'lessonDone', lesson: 'x' }, date).progress.streak
        .count,
    ).toBe(1);
    expect(
      applyActivity(emptyProgress(), { kind: 'glossaryRead', term: 'x' }, date).progress.streak
        .count,
    ).toBe(0);
  });
});

describe('activity facts', () => {
  const first = buildMarket(getScenario('first-steps'), 7, UNIVERSE);

  it('reports holdings, days held and SPY at a close', () => {
    const run = new Run(first, undefined, undefined, { pauseAtClose: false });
    run.place({
      ticker: 'KO',
      side: 'buy',
      type: 'market',
      amount: { kind: 'dollars', value: 1_000 },
    });
    run.place({
      ticker: 'SPY',
      side: 'buy',
      type: 'market',
      amount: { kind: 'dollars', value: 1_000 },
    });
    for (let d = 0; d < 3; d++) run.stepDay();
    expect(run.clock.bar).toBe(BARS_PER_DAY);
    const a = closeActivity(run);
    if (a.kind !== 'close') throw new Error('not a close');
    expect(a.day).toBe(2);
    expect(a.holdings.map((h) => [h.ticker, h.heldDays, h.etf])).toEqual(
      expect.arrayContaining([
        ['KO', 3, false],
        ['SPY', 3, true],
      ]),
    );
    expect(a.value).toBe(run.account.equityByDay[2]);
    expect(a.spyPct).toBeCloseTo(run.indexClose(3) / run.indexClose(2) - 1, 12);
  });

  it('restarts the held count after a position is closed', () => {
    const f = (day: number, side: 'buy' | 'sell', shares: number) => ({
      orderId: null,
      ticker: 'KO',
      side,
      shares,
      price: 1,
      mid: 1,
      commission: 0,
      realised: 0,
      at: { day, bar: 5 },
    });
    expect(heldDays([f(0, 'buy', 2), f(1, 'buy', 1)], 4).get('KO')).toBe(5);
    expect(heldDays([f(0, 'buy', 2), f(2, 'sell', 2), f(3, 'buy', 1)], 4).get('KO')).toBe(2);
    expect(heldDays([f(0, 'buy', 2), f(2, 'sell', 2)], 4).has('KO')).toBe(false);
  });
});
