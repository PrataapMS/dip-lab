import { describe, expect, it } from 'vitest';
import {
  type AccountState,
  type Amount,
  createAccount,
  DEFAULT_ACCOUNT_SETTINGS,
  executeTrade,
  markToMarket,
  recordClose,
  type Side,
  type TradeResult,
} from './account';
import { fillPrice, halfSpread } from './costs';
import { REFERENCE_MARKET_VOL } from './regimes';

const AT = { day: 0, bar: 10 };

function trade(state: AccountState, side: Side, amount: Amount, mid: number, half = 0, ticker = 'KO'): TradeResult {
  return executeTrade(state, { ticker, side, amount, mid, halfSpread: half, at: AT });
}

function ok(r: TradeResult): AccountState {
  if (!r.ok) throw new Error(r.reason);
  return r.state;
}

describe('costs', () => {
  it('sets the half-spread from volatility and market stress', () => {
    const on = { spreadOn: true };
    expect(halfSpread({ kind: 'etf', vol: 0.16 }, REFERENCE_MARKET_VOL, on)).toBeCloseTo(1e-4, 10);
    expect(halfSpread({ kind: 'stock', vol: 0.3 }, REFERENCE_MARKET_VOL, on)).toBeCloseTo(3.4e-4, 10);
    // Calm markets never narrow spreads below normal; stressed ones widen them.
    expect(halfSpread({ kind: 'stock', vol: 0.3 }, 0.08, on)).toBeCloseTo(3.4e-4, 10);
    expect(halfSpread({ kind: 'stock', vol: 0.3 }, REFERENCE_MARKET_VOL * 3, on)).toBeCloseTo(10.2e-4, 10);
    expect(halfSpread({ kind: 'stock', vol: 0.3 }, 0.5, { spreadOn: false })).toBe(0);
  });

  it('makes buys pay up and sells receive less', () => {
    expect(fillPrice(100, 'buy', 0.001)).toBeCloseTo(100.1, 10);
    expect(fillPrice(100, 'sell', 0.001)).toBeCloseTo(99.9, 10);
  });
});

describe('account', () => {
  it('starts with $10,000 cash, no commission and the spread on', () => {
    const a = createAccount();
    expect(a.cash).toBe(10_000);
    expect(a.settings).toEqual(DEFAULT_ACCOUNT_SETTINGS);
    expect(a.positions).toEqual({});
    expect(() => createAccount({ ...DEFAULT_ACCOUNT_SETTINGS, startingCash: 0 })).toThrow();
  });

  it('round-trips a buy and a sell with spread and commission', () => {
    let a = createAccount({ startingCash: 10_000, commission: 1, spreadOn: true });
    a = ok(trade(a, 'buy', { kind: 'shares', value: 10 }, 50, 0.001));
    expect(a.cash).toBeCloseTo(10_000 - 10 * 50.05 - 1, 9);
    expect(a.positions.KO).toEqual({ shares: 10, costBasis: 501.5 });
    a = ok(trade(a, 'sell', { kind: 'shares', value: 10 }, 55, 0.001));
    const proceeds = 10 * 54.945 - 1;
    expect(a.cash).toBeCloseTo(10_000 - 501.5 + proceeds, 9);
    expect(a.positions.KO).toBeUndefined();
    expect(a.realised).toBeCloseTo(proceeds - 501.5, 9);
    expect(a.feesPaid).toBe(2);
    expect(a.spreadPaid).toBeCloseTo(10 * 0.05 + 10 * 0.055, 9);
    expect(a.fills.map((f) => f.side)).toEqual(['buy', 'sell']);
  });

  it('averages the cost across two buys', () => {
    let a = createAccount();
    a = ok(trade(a, 'buy', { kind: 'shares', value: 10 }, 100));
    a = ok(trade(a, 'buy', { kind: 'shares', value: 30 }, 120));
    const marks = markToMarket(a, () => ({ price: 120, sector: 'Consumer Staples' }));
    expect(marks.positions[0]?.avgCost).toBeCloseTo(115, 9);
    expect(marks.positions[0]?.unrealised).toBeCloseTo(40 * 120 - 4600, 9);
  });

  it('keeps the average cost after a partial sell', () => {
    let a = createAccount();
    a = ok(trade(a, 'buy', { kind: 'shares', value: 10 }, 100));
    a = ok(trade(a, 'buy', { kind: 'shares', value: 10 }, 200));
    a = ok(trade(a, 'sell', { kind: 'shares', value: 5 }, 180));
    const pos = a.positions.KO;
    expect(pos?.shares).toBe(15);
    expect((pos?.costBasis ?? 0) / (pos?.shares ?? 1)).toBeCloseTo(150, 9);
    expect(a.realised).toBeCloseTo(5 * (180 - 150), 9);
  });

  it('buys fractional shares by dollars without overspending', () => {
    let a = createAccount();
    a = ok(trade(a, 'buy', { kind: 'dollars', value: 1_000 }, 812.4, 0.0003));
    const shares = a.positions.KO?.shares ?? 0;
    expect(shares).toBeGreaterThan(1.2);
    expect(Math.abs(shares * 1e6 - Math.round(shares * 1e6))).toBeLessThan(1e-6);
    expect(10_000 - a.cash).toBeLessThanOrEqual(1_000);
    expect(10_000 - a.cash).toBeGreaterThan(999.99);
  });

  it('rejects a buy without enough cash, in plain words', () => {
    const a = createAccount({ startingCash: 500, commission: 0, spreadOn: false });
    const r = trade(a, 'buy', { kind: 'dollars', value: 1_000 }, 50);
    expect(r).toEqual({ ok: false, reason: 'Not enough cash: this needs $1,000.00 and you have $500.00.' });
  });

  it('caps sells at the shares held', () => {
    let a = createAccount();
    expect(trade(a, 'sell', { kind: 'shares', value: 1 }, 50)).toEqual({ ok: false, reason: "You don't own any KO." });
    a = ok(trade(a, 'buy', { kind: 'shares', value: 2.5 }, 50));
    const r = trade(a, 'sell', { kind: 'shares', value: 3 }, 50);
    expect(r).toEqual({ ok: false, reason: "You own 2.5 shares of KO, so you can't sell 3 shares." });
    expect(trade(a, 'buy', { kind: 'shares', value: 0 }, 50)).toEqual({ ok: false, reason: 'Enter an amount above zero.' });
  });

  it('sells everything when a dollar sell rounds just above the holding', () => {
    let a = createAccount();
    a = ok(trade(a, 'buy', { kind: 'dollars', value: 1_000 }, 33.33));
    const held = a.positions.KO?.shares ?? 0;
    a = ok(trade(a, 'sell', { kind: 'dollars', value: held * 33.33 + 0.00001 }, 33.33));
    expect(a.positions.KO).toBeUndefined();
  });

  it('marks to market with a sector mix', () => {
    let a = createAccount();
    a = ok(trade(a, 'buy', { kind: 'dollars', value: 3_000 }, 100, 0, 'KO'));
    a = ok(trade(a, 'buy', { kind: 'dollars', value: 1_000 }, 100, 0, 'SPY'));
    const quotes: Record<string, { price: number; sector: string | null }> = {
      KO: { price: 110, sector: 'Consumer Staples' },
      SPY: { price: 90, sector: null },
    };
    const m = markToMarket(a, (t) => quotes[t]);
    expect(m.holdingsValue).toBeCloseTo(3_300 + 900, 6);
    expect(m.value).toBeCloseTo(6_000 + 4_200, 6);
    expect(m.unrealised).toBeCloseTo(200, 6);
    expect(m.positions.map((p) => p.ticker)).toEqual(['KO', 'SPY']);
    expect(m.positions[1]?.unrealisedPct).toBeCloseTo(-0.1, 9);
    expect(m.sectorMix.map((s) => s.sector)).toEqual(['Consumer Staples', 'Broad market']);
    expect(m.sectorMix[0]?.share).toBeCloseTo(3_300 / 4_200, 9);
    expect(recordClose(a, m.value).equityByDay).toEqual([m.value]);
  });

  it('is deterministic for the same trades', () => {
    const run = () => {
      let a = createAccount({ startingCash: 25_000, commission: 0.5, spreadOn: true });
      a = ok(trade(a, 'buy', { kind: 'dollars', value: 7_777.77 }, 123.45, 0.00034));
      a = ok(trade(a, 'sell', { kind: 'shares', value: 13.37 }, 130.01, 0.00051));
      a = ok(trade(a, 'buy', { kind: 'shares', value: 4 }, 99.99, 0.0002, 'NVDA'));
      return a;
    };
    expect(run()).toEqual(run());
  });
});
