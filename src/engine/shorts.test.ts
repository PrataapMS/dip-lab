import { describe, expect, it } from 'vitest';
import { UNIVERSE } from '../data/universe';
import {
  type AccountState,
  chargeBorrowFees,
  createAccount,
  DEFAULT_ACCOUNT_SETTINGS,
  executeTrade,
  markToMarket,
  payDividends,
  type Side,
} from './account';
import { debrief } from './debrief';
import { checkMargin, forceSale } from './margin';
import { buildMarket } from './market';
import { describeOrder, orderMessage } from './orders';
import { Run } from './run';
import { getScenario } from './scenarios';

const AT = { day: 0, bar: 10 };
const SHORTS = { ...DEFAULT_ACCOUNT_SETTINGS, spreadOn: false, margin: true, shorts: true };

function trade(state: AccountState, side: Side, shares: number, mid: number, ticker = 'KO', prices?: (t: string) => number | undefined) {
  return executeTrade(state, { ticker, side, amount: { kind: 'shares', value: shares }, mid, halfSpread: 0, at: AT, prices });
}

function ok(r: ReturnType<typeof trade>): AccountState {
  if (!r.ok) throw new Error(r.reason);
  return r.state;
}

describe('short selling', () => {
  it('opens, partly covers and fully covers with the right P&L', () => {
    let a = ok(trade(createAccount(SHORTS), 'sell', 100, 50));
    expect(a.cash).toBe(15_000);
    expect(a.positions.KO).toEqual({ shares: -100, costBasis: -5_000 });
    expect(a.fills[0]?.short).toBe(true);

    const m = markToMarket(a, () => ({ price: 40, sector: 'Consumer Staples' }));
    expect(m.value).toBe(11_000);
    expect(m.positions[0]?.avgCost).toBe(50);
    expect(m.positions[0]?.unrealised).toBe(1_000);
    expect(m.positions[0]?.unrealisedPct).toBeCloseTo(0.2, 9);

    a = ok(trade(a, 'buy', 40, 40));
    expect(a.fills[1]?.realised).toBeCloseTo(400, 9);
    expect(a.fills[1]?.short).toBe(true);
    expect(a.positions.KO).toEqual({ shares: -60, costBasis: -3_000 });
    a = ok(trade(a, 'buy', 60, 60));
    expect(a.fills[2]?.realised).toBeCloseTo(-600, 9);
    expect(a.positions.KO).toBeUndefined();
    expect(a.realised).toBeCloseTo(-200, 9);
    expect(a.cash).toBeCloseTo(9_800, 9);
  });

  it('refuses to cover more than is short, or to flip a long into a short', () => {
    let a = ok(trade(createAccount(SHORTS), 'sell', 10, 50));
    const over = trade(a, 'buy', 11, 50);
    expect(over.ok).toBe(false);
    a = ok(trade(createAccount(SHORTS), 'buy', 10, 50));
    const flip = trade(a, 'sell', 11, 50);
    expect(flip.ok).toBe(false);
    if (!flip.ok) expect(flip.reason).toMatch(/then short/);
  });

  it('needs shorts and margin turned on', () => {
    for (const settings of [DEFAULT_ACCOUNT_SETTINGS, { ...SHORTS, margin: false }, { ...SHORTS, shorts: false }]) {
      const r = trade(createAccount(settings), 'sell', 1, 50);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toMatch(/don't own any KO/);
    }
  });

  it('limits shorts by buying power', () => {
    const a = createAccount(SHORTS);
    expect(trade(a, 'sell', 400, 50).ok).toBe(true);
    const r = trade(a, 'sell', 401, 50);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/buying power/);
  });

  it('charges a borrow fee and the dividend to the short seller', () => {
    const a = ok(trade(createAccount(SHORTS), 'sell', 100, 50));
    const fee = chargeBorrowFees(a, () => 50);
    expect(fee.borrowFeesPaid).toBeCloseTo((5_000 * 0.005) / 252, 9);
    const moon = ok(trade(createAccount(SHORTS), 'sell', 100, 50, 'MOONR'));
    expect(chargeBorrowFees(moon, () => 50).borrowFeesPaid).toBeCloseTo((5_000 * 0.3) / 252, 9);
    const paid = payDividends(a, [{ ticker: 'KO', perShare: 0.5 }], { day: 3, bar: 0 });
    expect(paid.cash).toBeCloseTo(a.cash - 50, 9);
    expect(paid.dividendsPaid).toBeCloseTo(50, 9);
    expect(paid.dividendsReceived).toBe(0);
    expect(paid.dividends[0]?.amount).toBeCloseTo(-50, 9);
  });

  it('a squeeze leads to a margin call and a forced cover', () => {
    const a = ok(trade(createAccount(SHORTS), 'sell', 400, 50));
    // Equity 30,000 − 400p over holdings 400p: under 30% once p > 57.69.
    const called = checkMargin(a, () => 58, 5);
    expect(called.event?.kind).toBe('call');
    const r = forceSale({ ...called.state, forcedSaleDue: true }, () => ({ mid: 62, half: 0 }), { day: 7, bar: 0 });
    expect(r.fills[0]?.side).toBe('buy');
    expect(r.fills[0]?.forced).toBe(true);
    expect(r.fills[0]?.realised).toBeLessThan(0);
    const left = r.state.positions.KO?.shares ?? 0;
    expect(left).toBeLessThan(0);
    expect(left).toBeGreaterThan(-400);
  });

  it('describes shorts in plain words', () => {
    const draft = { ticker: 'NVDA', side: 'sell' as const, type: 'market' as const, amount: { kind: 'dollars' as const, value: 1_000 } };
    expect(describeOrder(draft, 0)).toBe('Short $1,000 of NVDA');
    expect(describeOrder({ ...draft, side: 'buy', amount: { kind: 'shares', value: 12 } }, -12)).toBe('Buy to cover 12 shares of NVDA');
    expect(describeOrder(draft)).toBe('Sell $1,000 of NVDA');
    expect(
      orderMessage({ ...draft, id: 1, tif: 'day', status: 'filled', placedAt: AT, fillPrice: 10, filledShares: 100, short: true }),
    ).toBe('Sold short 100 shares of NVDA at $10.00.');
  });
});

describe('shorts in a run and the debrief', () => {
  const covid = buildMarket(getScenario('covid-2020'), 21, UNIVERSE);

  it('scores a short through a crash and flags a squeeze in the rebound', () => {
    const run = new Run(covid, { ...DEFAULT_ACCOUNT_SETTINGS, margin: true, shorts: true }, undefined, { pauseAtClose: false });
    // Short at the bottom of the crash, the worst possible moment.
    const closes = covid.closes[run.indexInstrument] ?? new Float64Array();
    let low = 1;
    for (let k = 1; k < closes.length; k++) if ((closes[k] ?? 0) < (closes[low] ?? 0)) low = k;
    while (run.clock.day < low) run.stepDay();
    const r = run.place({ ticker: 'SPY', side: 'sell', type: 'market', amount: { kind: 'dollars', value: 5_000 } });
    expect(r.status).toBe('open'); // after the close: fills at the next open
    while (!run.finished) run.stepDay();
    expect(run.account.fills[0]?.short).toBe(true);
    expect(run.account.borrowFeesPaid).toBeGreaterThan(0);
    const d = debrief(run);
    expect(d.borrowFees).toBeCloseTo(run.account.borrowFeesPaid, 9);
    // Still short at the end: counted as an open trade, priced at the end.
    expect(d.closedTrades).toBe(1);
    const spy = run.account.positions.SPY;
    expect(spy?.shares).toBeLessThan(0);
    expect(d.maxWeight).toBeNull();
    // SPY rebounds well above its start by December: the short went against the player.
    expect(d.moments.map((m) => m.kind)).toContain('shortSqueeze');
  });
});
