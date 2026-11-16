import { describe, expect, it } from 'vitest';
import { UNIVERSE } from '../data/universe';
import { BARS_PER_DAY } from './intraday';
import { exDividendDays, quarterlyYield } from './dividends';
import { buildMarket } from './market';
import { Run } from './run';
import { getScenario } from './scenarios';

const market = buildMarket(getScenario('first-steps'), 5, UNIVERSE);
const spyIndex = market.instruments.findIndex((i) => i.ticker === 'SPY');
const spy = market.instruments[spyIndex];
const exDay = market.dividends.find((d) => d.ticker === 'SPY')?.day ?? -1;

/** Walk the clock to a day's open. */
function toOpen(run: Run, day: number): void {
  while (run.clock.day < day) run.step();
}

/** Walk to the close of the day before. */
function toCloseBefore(run: Run, day: number): void {
  while (run.clock.day < day - 1 || run.clock.bar < BARS_PER_DAY) run.step();
}

describe('dividends', () => {
  it('schedules four ex-dates a year, funds in Mar/Jun/Sep/Dec', () => {
    const year = buildMarket(getScenario('rate-shock-2022'), 5, UNIVERSE);
    const ko = year.instruments.find((i) => i.ticker === 'KO');
    if (!ko || !spy) throw new Error('missing');
    expect(exDividendDays(ko, year.dates)).toHaveLength(4);
    const months = exDividendDays(spy, year.dates).map((d) => Number(year.dates[d]?.slice(5, 7)));
    expect(months).toEqual([3, 6, 9, 12]);
    const tsla = year.instruments.find((i) => i.ticker === 'TSLA');
    if (tsla) expect(exDividendDays(tsla, year.dates)).toHaveLength(0);
  });

  it('drops the price by the dividend at the ex-date open', () => {
    expect(exDay).toBeGreaterThan(0);
    if (!spy) throw new Error('SPY missing');
    expect(market.jumps[spyIndex]?.[exDay]).toBeCloseTo(Math.log(1 - quarterlyYield(spy)), 6);
    const d = market.dividends.find((x) => x.ticker === 'SPY');
    expect(d?.perShare).toBeCloseTo((market.closes[spyIndex]?.[exDay] ?? 0) * quarterlyYield(spy), 4);
  });

  it('pays holders at the previous close', () => {
    const run = new Run(market);
    run.place({ ticker: 'SPY', side: 'buy', type: 'market', amount: { kind: 'shares', value: 10 } });
    toCloseBefore(run, exDay);
    const cash = run.account.cash;
    run.step();
    const perShare = market.dividends.find((x) => x.ticker === 'SPY')?.perShare ?? 0;
    expect(run.account.cash).toBeCloseTo(cash + 10 * perShare, 6);
    expect(run.account.dividendsReceived).toBeCloseTo(10 * perShare, 6);
    expect(run.view().recentDividends[0]).toMatchObject({ ticker: 'SPY', shares: 10 });
  });

  it('pays nothing if sold before, or bought on, the ex-date', () => {
    const sold = new Run(market);
    sold.place({ ticker: 'SPY', side: 'buy', type: 'market', amount: { kind: 'shares', value: 10 } });
    while (sold.clock.day < exDay - 1 || sold.clock.bar < BARS_PER_DAY - 1) sold.step();
    sold.place({ ticker: 'SPY', side: 'sell', type: 'market', amount: { kind: 'shares', value: 10 } });
    toOpen(sold, exDay);
    expect(sold.account.dividendsReceived).toBe(0);

    // An order placed after the close only fills at the next open, after the dividend is paid.
    const after = new Run(market);
    after.place({ ticker: 'SPY', side: 'buy', type: 'market', amount: { kind: 'shares', value: 10 } });
    toCloseBefore(after, exDay);
    after.place({ ticker: 'SPY', side: 'sell', type: 'market', amount: { kind: 'shares', value: 10 } });
    after.step();
    expect(after.account.dividendsReceived).toBeGreaterThan(0);

    const late = new Run(market);
    toOpen(late, exDay);
    late.place({ ticker: 'SPY', side: 'buy', type: 'market', amount: { kind: 'shares', value: 10 } });
    late.stepDay();
    expect(late.account.dividendsReceived).toBe(0);
  });

  it('is the same for the same seed, and counts in SPY total return', () => {
    expect(buildMarket(getScenario('first-steps'), 5, UNIVERSE).dividends).toEqual(market.dividends);
    const run = new Run(market);
    expect(run.indexFactor[exDay - 1]).toBe(1);
    expect(run.indexFactor[exDay]).toBeGreaterThan(1);
    const k = exDay + 1;
    expect(run.indexClose(k)).toBeGreaterThan(market.closes[spyIndex]?.[k] ?? 0);
  });
});
