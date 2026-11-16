import { describe, expect, it } from 'vitest';
import { UNIVERSE } from '../data/universe';
import { BARS_PER_DAY } from './intraday';
import { buildMarket } from './market';
import { Run } from './run';
import { getScenario } from './scenarios';

const market = buildMarket(getScenario('first-steps'), 11, UNIVERSE);

function koIndex(run: Run): number {
  const i = run.indexOf('KO');
  if (i === undefined) throw new Error('KO missing');
  return i;
}

describe('run', () => {
  it('fills a market buy and records the account value at each close', () => {
    const run = new Run(market);
    const order = run.place({ ticker: 'KO', side: 'buy', type: 'market', amount: { kind: 'dollars', value: 1_000 } });
    expect(order.status).toBe('filled');
    expect(run.account.cash).toBeCloseTo(9_000, 2);
    run.stepDay();
    expect([run.clock.day, run.clock.bar]).toEqual([0, BARS_PER_DAY]);
    expect(run.account.equityByDay).toHaveLength(1);
    expect(run.account.equityByDay[0]).toBeCloseTo(run.view().value, 6);
    run.stepDay();
    expect(run.account.equityByDay).toHaveLength(2);
    expect(run.view().prevCloseValue).toBe(run.account.equityByDay[0]);
  });

  it('walks every bar when playing fast, so a limit fills on the bar that crosses it', () => {
    const run = new Run(market);
    const i = koIndex(run);
    const limit = run.mid(i) * 0.998;
    run.setDayLength(7_500);
    run.place({ ticker: 'KO', side: 'buy', type: 'limit', limitPrice: limit, tif: 'gtc', amount: { kind: 'shares', value: 3 } });
    run.play(true);
    let filled = run.account.orders[0];
    for (let t = 0; t < 600 && filled?.status === 'open'; t++) {
      run.advance(1_000);
      filled = run.account.orders[0];
    }
    expect(filled?.status).toBe('filled');
    expect(filled?.fillPrice).toBeLessThanOrEqual(limit);
    // Days passed are all on the equity curve: nothing was skipped.
    expect(run.account.equityByDay).toHaveLength(run.clock.day + (run.clock.bar === BARS_PER_DAY ? 1 : 0));
  });

  it('expires a day limit at the close', () => {
    const run = new Run(market);
    const i = koIndex(run);
    run.place({ ticker: 'KO', side: 'buy', type: 'limit', limitPrice: run.mid(i) * 0.5, amount: { kind: 'shares', value: 1 } });
    const changed = run.stepDay();
    expect(changed.map((o) => o.status)).toEqual(['expired']);
    expect(run.view().openOrders).toEqual([]);
  });

  it('replays identically with the same seed and the same orders', () => {
    const play = () => {
      const run = new Run(buildMarket(getScenario('first-steps'), 11, UNIVERSE));
      run.place({ ticker: 'NVDA', side: 'buy', type: 'market', amount: { kind: 'dollars', value: 4_000 } });
      run.place({ ticker: 'NVDA', side: 'sell', type: 'stop', stopPrice: run.mid(run.indexOf('NVDA') ?? 0) * 0.97, tif: 'gtc', amount: { kind: 'shares', value: 1 } });
      for (let d = 0; d < 10; d++) run.stepDay();
      run.place({ ticker: 'SPY', side: 'buy', type: 'market', amount: { kind: 'dollars', value: 2_000 } });
      for (let d = 0; d < 10; d++) run.stepDay();
      return run.account;
    };
    const a = play();
    expect(a.equityByDay).toHaveLength(20);
    expect(play()).toEqual(a);
  });
});
