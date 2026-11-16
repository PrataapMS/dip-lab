import { describe, expect, it } from 'vitest';
import { parseAmount, type PreviewInput, previewOrder, riskCheck } from './orderPreview';

const base: PreviewInput = {
  side: 'buy',
  type: 'market',
  unit: 'dollars',
  amount: 1_000,
  price: 100,
  half: 0.001,
  cash: 10_000,
  heldShares: 0,
  commission: 0,
};

describe('order preview', () => {
  it('estimates a market buy with the spread', () => {
    const p = previewOrder(base);
    expect(p.fillPrice).toBeCloseTo(100.1, 9);
    expect(p.estShares).toBeCloseTo(1_000 / 100.1, 9);
    expect(p.cashAfter).toBeCloseTo(9_000, 6);
    expect(p.fillsNow).toBe(true);
    expect(p.problem).toBeNull();
  });

  it('prices a resting limit at the limit and a marketable one at the ask', () => {
    expect(previewOrder({ ...base, type: 'limit', limitPrice: 95 })).toMatchObject({ fillPrice: 95, fillsNow: false });
    expect(previewOrder({ ...base, type: 'limit', limitPrice: 105 }).fillsNow).toBe(true);
  });

  it('prices a stop-loss at the stop less the spread', () => {
    const p = previewOrder({ ...base, side: 'sell', type: 'stop', stopPrice: 90, unit: 'shares', amount: 5, heldShares: 5 });
    expect(p.fillPrice).toBeCloseTo(89.91, 9);
    expect(p.fillsNow).toBe(false);
  });

  it('flags problems in plain words', () => {
    expect(previewOrder({ ...base, amount: 20_000 }).problem).toBe('Not enough cash for this order.');
    expect(previewOrder({ ...base, side: 'sell' }).problem).toBe("You don't own any of this stock.");
    expect(previewOrder({ ...base, side: 'sell', unit: 'shares', amount: 3, heldShares: 2 }).problem).toBe('You only own 2 shares.');
    expect(previewOrder({ ...base, amount: NaN }).problem).toBe('Enter an amount above zero.');
    expect(previewOrder({ ...base, type: 'limit' }).problem).toBe('Set a limit price above zero.');
  });
});

describe('risk check', () => {
  const r = { side: 'buy' as const, ticker: 'NVDA', kind: 'stock' as const, vol: 0.5, heldValue: 0, accountValue: 10_000 };
  it('rises with position size and volatility', () => {
    expect(riskCheck({ ...r, orderValue: 100 }).level).toBe(1);
    expect(riskCheck({ ...r, orderValue: 1_000 }).level).toBe(3);
    expect(riskCheck({ ...r, orderValue: 9_000 }).level).toBe(5);
    expect(riskCheck({ ...r, vol: 0.2, orderValue: 1_000 }).level).toBe(2);
    expect(riskCheck({ ...r, orderValue: 950 }).text).toBe('NVDA swings a lot, and this puts 9.5% of your account in it.');
  });

  it('treats funds and sells as lower risk', () => {
    expect(riskCheck({ ...r, ticker: 'SPY', kind: 'etf', vol: 0.16, orderValue: 3_000 }).level).toBe(2);
    expect(riskCheck({ ...r, side: 'sell', heldValue: 1_000, orderValue: 1_000 })).toMatchObject({ level: 1, text: 'This closes your NVDA position.' });
    expect(riskCheck({ ...r, side: 'sell', heldValue: 1_000, orderValue: 990, closesPosition: true }).text).toBe('This closes your NVDA position.');
    expect(riskCheck({ ...r, side: 'sell', heldValue: 1_000, orderValue: 500 }).text).toBe('Selling lowers your bet on NVDA to 5.0% of your account.');
  });
});

describe('amount parsing', () => {
  it('accepts dollars, commas and decimals', () => {
    expect(parseAmount('$1,000.50')).toBe(1000.5);
    expect(parseAmount('3.5')).toBe(3.5);
    expect(parseAmount('')).toBeNaN();
    expect(parseAmount('abc')).toBeNaN();
  });
});
