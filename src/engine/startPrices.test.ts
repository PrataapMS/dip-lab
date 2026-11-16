import { describe, expect, it } from 'vitest';
import { UNIVERSE } from '../data/universe';
import { buildMarket, startPrice } from './market';
import { customScenario, SCENARIOS } from './scenarios';
import { knownStartPrice } from './startPrices';

describe('start prices', () => {
  it('starts SPY near its real level in every scenario', () => {
    for (const def of SCENARIOS) {
      const m = buildMarket(def, 7, UNIVERSE);
      const spy = m.instruments.findIndex((i) => i.ticker === 'SPY');
      expect(m.closes[spy]?.[0]).toBeCloseTo(knownStartPrice(def.start, 'SPY') ?? 0, 3);
    }
    expect(knownStartPrice('2020-02-20', 'SPY')).toBe(337);
    expect(knownStartPrice('2024-01-02', 'NVDA')).toBe(495);
  });

  it('interpolates funds between anchors and holds them at the ends', () => {
    const mid = knownStartPrice('2012-06-01', 'SPY') ?? 0;
    expect(mid).toBeGreaterThan(113);
    expect(mid).toBeLessThan(206);
    expect(knownStartPrice('1990-01-01', 'SPY')).toBe(97);
    expect(knownStartPrice('2030-01-01', 'SPY')).toBe(586);
  });

  it('only uses an exact date for stocks', () => {
    expect(knownStartPrice('2012-06-01', 'AAPL')).toBeUndefined();
    expect(knownStartPrice('2024-01-02', 'ZTS')).toBeUndefined();
  });

  it('falls back to the seeded price for other stocks and for Custom stocks', () => {
    const custom = buildMarket(customScenario({ start: '2012-06-01', days: 20 }), 3, UNIVERSE);
    const at = (t: string) => custom.closes[custom.instruments.findIndex((i) => i.ticker === t)]?.[0];
    expect(at('AAPL')).toBeCloseTo(startPrice(3, 'AAPL'), 3);
    expect(at('QQQ')).toBeCloseTo(knownStartPrice('2012-06-01', 'QQQ') ?? 0, 3);
  });
});
