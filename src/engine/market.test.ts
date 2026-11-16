import { describe, expect, it } from 'vitest';
import { UNIVERSE } from '../data/universe';
import { BARS_PER_DAY, POINTS_PER_DAY } from './intraday';
import { buildMarket, dayBars, dayPrices, instrumentsFor, startPrice } from './market';
import { getScenario } from './scenarios';

const covid = buildMarket(getScenario('covid-2020'), 42, UNIVERSE);
const idx = (ticker: string) => covid.instruments.findIndex((i) => i.ticker === ticker);

describe('market', () => {
  it('is deterministic for a scenario and seed', () => {
    const again = buildMarket(getScenario('covid-2020'), 42, UNIVERSE);
    expect(again.closes).toEqual(covid.closes);
    const other = buildMarket(getScenario('covid-2020'), 43, UNIVERSE);
    expect(other.closes[idx('AAPL')]).not.toEqual(covid.closes[idx('AAPL')]);
  });

  it('hides instruments listed after the scenario starts', () => {
    const tickers = (id: string) => instrumentsFor(getScenario(id), UNIVERSE).map((i) => i.ticker);
    expect(tickers('dot-com')).not.toContain('GOOGL');
    expect(tickers('gfc-2008')).toContain('GOOGL');
    expect(tickers('gfc-2008')).not.toContain('XLRE');
    expect(tickers('meme-squeeze')).toContain('MOONR');
  });

  it('gives every instrument one close per day plus a start price', () => {
    for (const c of covid.closes) {
      expect(c).toHaveLength(covid.dates.length + 1);
      expect(c.every((p) => p > 0 && Number.isFinite(p))).toBe(true);
    }
  });

  it('makes SPY follow the scenario shape', () => {
    const spy = covid.closes[idx('SPY')];
    if (!spy) throw new Error('SPY missing');
    const trough = (spy[23] ?? 0) / (spy[0] ?? 1);
    expect(trough).toBeGreaterThan(0.6);
    expect(trough).toBeLessThan(0.72);
  });

  it('builds intraday prices that open near the previous close and end at the close', () => {
    const day = 10;
    const prices = dayPrices(covid, day);
    expect(prices).toHaveLength(covid.instruments.length * POINTS_PER_DAY);
    covid.instruments.forEach((_, i) => {
      const close = covid.closes[i]?.[day + 1] ?? 0;
      const prev = covid.closes[i]?.[day] ?? 0;
      expect(prices[i * POINTS_PER_DAY + BARS_PER_DAY]).toBeCloseTo(close, 3);
      const open = prices[i * POINTS_PER_DAY] ?? 0;
      expect(Math.abs(Math.log(open / prev))).toBeLessThan(0.5);
    });
    expect(dayPrices(covid, day)).toEqual(prices);
  });

  it('gives each bar a high and low that contain its open and close', () => {
    const { points, high, low } = dayBars(covid, 5);
    expect(high).toHaveLength(covid.instruments.length * BARS_PER_DAY);
    for (let i = 0; i < covid.instruments.length; i += 37) {
      for (let k = 0; k < BARS_PER_DAY; k++) {
        const o = points[i * POINTS_PER_DAY + k] ?? 0;
        const c = points[i * POINTS_PER_DAY + k + 1] ?? 0;
        expect(high[i * BARS_PER_DAY + k]).toBeGreaterThanOrEqual(Math.max(o, c));
        expect(low[i * BARS_PER_DAY + k]).toBeLessThanOrEqual(Math.min(o, c));
      }
    }
    expect(dayBars(covid, 5).points).toEqual(dayPrices(covid, 5));
  });

  it('prices are stable per ticker and seed', () => {
    expect(startPrice(1, 'AAPL')).toBe(startPrice(1, 'AAPL'));
    expect(startPrice(1, 'AAPL')).toBeGreaterThanOrEqual(5);
    expect(startPrice(1, 'AAPL')).toBeLessThanOrEqual(1500);
  });
});
