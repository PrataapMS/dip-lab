import { describe, expect, it } from 'vitest';
import { UNIVERSE } from '../data/universe';
import { debrief } from './debrief';
import { BARS_PER_DAY } from './intraday';
import { buildMarket } from './market';
import type { OrderDraft } from './orders';
import { Run } from './run';
import { getScenario } from './scenarios';

const first = buildMarket(getScenario('first-steps'), 7, UNIVERSE);

type Script = Record<number, OrderDraft[]>;

const SCRIPT: Script = {
  0: [{ ticker: 'SPY', side: 'buy', type: 'market', amount: { kind: 'dollars', value: 5_000 } }],
  3: [{ ticker: 'AAPL', side: 'buy', type: 'market', amount: { kind: 'dollars', value: 2_000 } }],
  8: [{ ticker: 'AAPL', side: 'sell', type: 'stop', stopPrice: 1, amount: { kind: 'shares', value: 1 }, tif: 'gtc' }],
  15: [{ ticker: 'SPY', side: 'sell', type: 'market', amount: { kind: 'shares', value: 3 } }],
  25: [{ ticker: 'MSFT', side: 'buy', type: 'limit', limitPrice: 1_000, amount: { kind: 'dollars', value: 1_000 } }],
};

/** Play to the end, placing each day's orders at that day's open. */
function play(run: Run, script: Script): Run {
  while (!run.finished) {
    if (run.clock.bar === 0) for (const d of script[run.clock.day] ?? []) run.place(d);
    run.step();
  }
  return run;
}

function fresh(): Run {
  return new Run(first, undefined, undefined, { pauseAtClose: false });
}

function walkTo(run: Run, day: number, script: Script): Run {
  while (!(run.clock.day === day && run.clock.bar === BARS_PER_DAY)) {
    if (run.clock.bar === 0) for (const d of script[run.clock.day] ?? []) run.place(d);
    run.step();
  }
  return run;
}

describe('replay a moment', () => {
  const original = play(fresh(), SCRIPT);

  it('rebuilds the account at any close exactly', () => {
    for (const day of [0, 2, 3, 8, 14, 15, 30, first.dates.length - 2]) {
      const live = walkTo(fresh(), day, SCRIPT);
      expect(original.accountAtClose(day)).toEqual(live.account);
    }
  });

  it('branches at the close before day N, paused', () => {
    const b = original.branch(15, { letter: 'B', score: 75 });
    expect(b.clock.day).toBe(14);
    expect(b.clock.bar).toBe(BARS_PER_DAY);
    expect(b.clock.playing).toBe(false);
    expect(b.finished).toBe(false);
    expect(b.branchOf).toEqual({ day: 15, letter: 'B', score: 75 });
    expect(b.account).toEqual(original.accountAtClose(14));
    // The original is untouched.
    expect(original.finished).toBe(true);
  });

  it('the same orders after the branch give the same result; a different one diverges', () => {
    const same = play(original.branch(15, { letter: 'B', score: 75 }), SCRIPT);
    expect(same.account).toEqual(original.account);
    const { 15: _skip, ...without } = SCRIPT;
    const other = play(original.branch(15, { letter: 'B', score: 75 }), without);
    expect(other.account.equityByDay[14]).toBe(original.account.equityByDay[14]);
    expect(other.account.equityByDay.at(-1)).not.toBe(original.account.equityByDay.at(-1));
    expect(debrief(other).branchOf?.letter).toBe('B');
  });

  it('day 0 starts from scratch', () => {
    const b = original.branch(0, { letter: 'C', score: 60 });
    expect(b.clock.day).toBe(0);
    expect(b.clock.bar).toBe(0);
    expect(b.account.fills).toEqual([]);
    expect(play(b, SCRIPT).account).toEqual(original.account);
  });
});
