import { describe, expect, it } from 'vitest';
import { UNIVERSE } from '../data/universe';
import { debrief, gradeRun, letterFor, worstDrawdown } from './debrief';
import { BARS_PER_DAY } from './intraday';
import { buildMarket } from './market';
import { Run } from './run';
import { getScenario } from './scenarios';

const first = buildMarket(getScenario('first-steps'), 21, UNIVERSE);
const covid = buildMarket(getScenario('covid-2020'), 21, UNIVERSE);

function playOut(run: Run): void {
  while (!run.finished) run.stepDay();
}

describe('debrief', () => {
  it('scores buy-and-hold SPY about a B and matches SPY', () => {
    const run = new Run(first);
    run.place({
      ticker: 'SPY',
      side: 'buy',
      type: 'market',
      amount: { kind: 'dollars', value: 10_000 },
    });
    playOut(run);
    const d = debrief(run);
    expect(d.ret).toBeCloseTo(d.spyRet, 2);
    expect(Math.abs(d.excessPts)).toBeLessThan(0.2);
    expect(d.you).toHaveLength(first.dates.length + 1);
    expect(d.spy).toHaveLength(d.you.length);
    expect(['B-', 'B', 'B+']).toContain(d.grade.letter);
    expect(d.moments).toEqual([]);
    expect(d.reason).toBe('lastDay');
  });

  it('caps an all-in single stock, however well it did', () => {
    const run = new Run(first);
    // Pick the stock that did best over the run: a lucky all-in bet.
    let best = 'AAPL';
    let bestRet = -1;
    first.instruments.forEach((inst, i) => {
      if (inst.kind !== 'stock') return;
      const c = first.closes[i];
      const r = (c?.[c.length - 1] ?? 0) / (c?.[1] ?? 1);
      if (r > bestRet) [best, bestRet] = [inst.ticker, r];
    });
    run.place({
      ticker: best,
      side: 'buy',
      type: 'market',
      amount: { kind: 'dollars', value: 9_900 },
    });
    playOut(run);
    const d = debrief(run);
    expect(d.ret).toBeGreaterThan(d.spyRet);
    expect(d.maxWeight?.ticker).toBe(best);
    expect(['C', 'C-', 'D', 'F']).toContain(d.grade.letter);
    expect(d.grade.score).toBeLessThan(65);
    expect(d.moments.map((x) => x.kind)).toContain('allIn');
    expect(d.best?.open).toBe(true);
  });

  it('flags selling near the low, and caps sitting in cash', () => {
    const run = new Run(covid);
    const spy = run.indexOf('SPY') ?? -1;
    const closes = covid.closes[spy] ?? new Float32Array();
    let lowDay = 0;
    for (let d = 0; d < 40; d++) if ((closes[d + 1] ?? 0) < (closes[lowDay + 1] ?? 0)) lowDay = d;
    run.place({
      ticker: 'SPY',
      side: 'buy',
      type: 'market',
      amount: { kind: 'dollars', value: 9_000 },
    });
    while (run.clock.day < lowDay || run.clock.bar < BARS_PER_DAY - 1) run.step();
    run.place({
      ticker: 'SPY',
      side: 'sell',
      type: 'market',
      amount: { kind: 'shares', value: run.account.positions.SPY?.shares ?? 0 },
    });
    playOut(run);
    const d = debrief(run);
    const sold = d.moments.find((x) => x.kind === 'soldNearLow');
    expect(sold?.day).toBe(lowDay);
    expect(sold?.lesson).toMatch(/^You sold SPY at a loss/);
    expect(d.grade.discipline).toBeLessThan(30);
    expect(d.grade.score).toBeLessThan(65);
    expect(d.avgInvested).toBeLessThan(0.25);
    expect(d.wins).toBe(0);
    expect(d.closedTrades).toBe(1);
  });

  it('flags a stop that slipped through an overnight gap', () => {
    // Find a stock that gaps down at least 4% at some open.
    let pick: { ticker: string; day: number } | null = null;
    for (const e of covid.events) {
      if (e.kind !== 'headline' && e.ticker && e.move < -0.06 && e.day > 2) {
        pick = { ticker: e.ticker, day: e.day };
        break;
      }
    }
    if (!pick) throw new Error('no gap found');
    const run = new Run(covid);
    run.place({
      ticker: pick.ticker,
      side: 'buy',
      type: 'market',
      amount: { kind: 'dollars', value: 2_000 },
    });
    while (run.clock.day < pick.day - 1 || run.clock.bar < BARS_PER_DAY - 1) run.step();
    const i = run.indexOf(pick.ticker) ?? -1;
    run.place({
      ticker: pick.ticker,
      side: 'sell',
      type: 'stop',
      stopPrice: run.mid(i) * 0.985,
      tif: 'gtc',
      amount: { kind: 'shares', value: run.account.positions[pick.ticker]?.shares ?? 0 },
    });
    playOut(run);
    const d = debrief(run);
    expect(d.moments.map((x) => x.kind)).toContain('stopSlippage');
  });

  it('values a run ended mid-day at current prices', () => {
    const run = new Run(first);
    run.place({
      ticker: 'KO',
      side: 'buy',
      type: 'market',
      amount: { kind: 'dollars', value: 3_000 },
    });
    run.stepDay();
    for (let k = 0; k < 30; k++) run.step();
    run.end();
    const d = debrief(run);
    expect(d.reason).toBe('ended');
    expect(d.you).toHaveLength(3);
    expect(d.endValue).toBeCloseTo(run.marks().value, 6);
    expect(d.days).toBe(2);
  });

  it('is deterministic', () => {
    const make = () => {
      const run = new Run(first);
      run.place({
        ticker: 'NVDA',
        side: 'buy',
        type: 'market',
        amount: { kind: 'dollars', value: 4_000 },
      });
      run.place({
        ticker: 'SPY',
        side: 'buy',
        type: 'market',
        amount: { kind: 'dollars', value: 4_000 },
      });
      for (let k = 0; k < 20; k++) run.stepDay();
      run.place({
        ticker: 'NVDA',
        side: 'sell',
        type: 'market',
        amount: { kind: 'dollars', value: 1_000 },
      });
      playOut(run);
      return debrief(run);
    };
    expect(make()).toEqual(make());
  });
});

describe('grade', () => {
  const base = {
    ret: 0.05,
    spyRet: 0.05,
    years: 0.25,
    dd: 0.05,
    spyDd: 0.05,
    costShare: 0,
    panicSells: 0,
    maxWeight: 0,
    tradesPerDay: 0.1,
    avgInvested: 0.9,
    bust: false,
  };
  it('maps scores to letters', () => {
    expect(letterFor(95)).toBe('A');
    expect(letterFor(80)).toBe('B+');
    expect(letterFor(10)).toBe('F');
  });
  it('rewards beating SPY with less risk', () => {
    expect(gradeRun({ ...base, ret: 0.12, dd: 0.03 }).letter).toBe('A');
    expect(gradeRun(base).letter).toBe('B+');
    expect(gradeRun({ ...base, ret: -0.1, dd: 0.15 }).letter).toBe('F');
  });
  it('caps concentration, sitting out and going bust', () => {
    expect(gradeRun({ ...base, ret: 0.3, maxWeight: 0.6 }).letter).toBe('B');
    const cash = gradeRun({ ...base, ret: 0.3, avgInvested: 0.1 });
    expect(cash.letter).toBe('C');
    expect(cash.cap).toMatch(/mostly in cash/);
    expect(gradeRun({ ...base, bust: true }).letter).toBe('F');
  });
  it('measures drawdown from the running peak', () => {
    expect(worstDrawdown([100, 120, 90, 130, 117])).toBeCloseTo(0.25, 6);
  });
});
