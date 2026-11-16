import { describe, expect, it } from 'vitest';
import { UNIVERSE } from '../data/universe';
import { BARS_PER_DAY } from './intraday';
import { buildMarket } from './market';
import { endAtClose, Run } from './run';
import { getScenario } from './scenarios';
import { daySummary } from './summary';

const short = buildMarket(getScenario('first-steps'), 9, UNIVERSE);
const long = buildMarket(getScenario('rate-shock-2022'), 9, UNIVERSE);

describe('end of run', () => {
  it('ends on the last day', () => {
    const run = new Run(short);
    while (!run.finished) run.stepDay();
    expect(run.endReason).toBe('lastDay');
    expect(run.account.equityByDay).toHaveLength(short.dates.length);
  });

  it('ends when the player presses End: orders cancelled, holdings kept, nothing more happens', () => {
    const run = new Run(short);
    run.place({ ticker: 'KO', side: 'buy', type: 'market', amount: { kind: 'dollars', value: 1_000 } });
    run.place({ ticker: 'KO', side: 'buy', type: 'limit', limitPrice: 1, tif: 'gtc', amount: { kind: 'shares', value: 1 } });
    for (let k = 0; k < 10; k++) run.step();
    const cancelled = run.end();
    expect(cancelled.map((o) => o.status)).toEqual(['cancelled']);
    expect(run.endReason).toBe('ended');
    expect(run.finished).toBe(true);
    expect(run.account.positions.KO?.shares).toBeGreaterThan(0);
    const at = run.at;
    run.play(true);
    expect(run.clock.playing).toBe(false);
    expect(run.step()).toEqual([]);
    expect(run.at).toEqual(at);
    expect(() => run.place({ ticker: 'KO', side: 'buy', type: 'market', amount: { kind: 'dollars', value: 10 } })).toThrow();
  });

  it('goes bust or hits a target only at a close', () => {
    expect(endAtClose(1_000, 10_000)).toBe('bust');
    expect(endAtClose(1_001, 10_000)).toBeNull();
    expect(endAtClose(12_000, 10_000, 0.2)).toBe('target');
    expect(endAtClose(11_999, 10_000, 0.2)).toBeNull();
    const run = new Run(short, undefined, undefined, { targetReturn: 0.0001 });
    run.place({ ticker: 'SPY', side: 'buy', type: 'market', amount: { kind: 'dollars', value: 9_000 } });
    while (!run.finished) run.stepDay();
    expect(['target', 'lastDay']).toContain(run.endReason);
    if (run.endReason === 'target') expect(run.clock.bar).toBe(BARS_PER_DAY);
  });

  it('pauses at each close in short scenarios by default', () => {
    expect(new Run(short).pauseAtClose).toBe(true);
    expect(new Run(long).pauseAtClose).toBe(false);
    const run = new Run(short);
    run.setDayLength(7_500);
    run.play(true);
    for (let k = 0; k < 20; k++) run.advance(1_000);
    expect([run.clock.day, run.clock.bar, run.clock.playing]).toEqual([0, BARS_PER_DAY, false]);
    run.play(true);
    for (let k = 0; k < 20; k++) run.advance(1_000);
    expect([run.clock.day, run.clock.bar]).toEqual([1, BARS_PER_DAY]);
    run.pauseAtClose = false;
    run.play(true);
    for (let k = 0; k < 20; k++) run.advance(1_000);
    expect(run.clock.day).toBeGreaterThan(2);
  });
});

describe('day summary', () => {
  it('matches the account at the close', () => {
    const run = new Run(short);
    run.place({ ticker: 'KO', side: 'buy', type: 'market', amount: { kind: 'dollars', value: 2_000 } });
    run.place({ ticker: 'MSFT', side: 'buy', type: 'market', amount: { kind: 'dollars', value: 2_000 } });
    run.stepDay();
    const s = daySummary(run);
    expect(s.day).toBe(0);
    expect(s.value).toBeCloseTo(run.account.equityByDay[0] ?? 0, 6);
    expect(s.change).toBeCloseTo(s.value - 10_000, 6);
    expect(s.trades).toBe(2);
    expect(s.best?.pct).toBeGreaterThanOrEqual(s.worst?.pct ?? 0);
    expect(new Set([s.best?.ticker, s.worst?.ticker])).toEqual(new Set(['KO', 'MSFT']));
    expect(s.headline).toBeTruthy();
    run.stepDay();
    expect(daySummary(run).trades).toBe(0);
  });
});
