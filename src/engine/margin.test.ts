import { describe, expect, it } from 'vitest';
import { UNIVERSE } from '../data/universe';
import { type AccountState, buyingPower, chargeInterest, createAccount, DEFAULT_ACCOUNT_SETTINGS, executeTrade, exposure } from './account';
import { debrief, gradeRun } from './debrief';
import { checkMargin, forceSale, marginRatio } from './margin';
import { buildMarket } from './market';
import { Run } from './run';
import { getScenario } from './scenarios';

const AT = { day: 0, bar: 10 };
const MARGIN = { ...DEFAULT_ACCOUNT_SETTINGS, spreadOn: false, margin: true };

function buy(state: AccountState, ticker: string, dollars: number, mid: number, prices?: (t: string) => number | undefined): AccountState {
  const r = executeTrade(state, { ticker, side: 'buy', amount: { kind: 'dollars', value: dollars }, mid, halfSpread: 0, at: AT, prices });
  if (!r.ok) throw new Error(r.reason);
  return r.state;
}

describe('margin account', () => {
  it('buys up to 2x equity and no more', () => {
    let a = createAccount(MARGIN);
    expect(buyingPower(a)).toBe(20_000);
    a = buy(a, 'KO', 15_000, 50);
    expect(a.cash).toBe(-5_000);
    expect(buyingPower(a, () => 50)).toBeCloseTo(5_000, 6);
    const r = executeTrade(a, { ticker: 'PEP', side: 'buy', amount: { kind: 'dollars', value: 5_100 }, mid: 100, halfSpread: 0, at: AT, prices: () => 50 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/buying power/);
    expect(() => buy(a, 'PEP', 5_000, 100, () => 50)).not.toThrow();
  });

  it('keeps the cash rule when margin is off', () => {
    const a = createAccount({ ...MARGIN, margin: false });
    expect(buyingPower(a)).toBe(10_000);
    const r = executeTrade(a, { ticker: 'KO', side: 'buy', amount: { kind: 'dollars', value: 10_001 }, mid: 50, halfSpread: 0, at: AT });
    expect(r.ok).toBe(false);
  });

  it('charges a day of interest only on borrowed cash', () => {
    const a = createAccount(MARGIN);
    expect(chargeInterest(a)).toBe(a);
    const b = chargeInterest(buy(a, 'KO', 20_000, 50));
    expect(b.interestPaid).toBeCloseTo((10_000 * 0.08) / 252, 9);
    expect(b.cash).toBeCloseTo(-10_000 - b.interestPaid, 9);
  });

  it('calls below 30% and not at 31%, then makes the sale due at the next close', () => {
    const a = buy(createAccount(MARGIN), 'KO', 20_000, 50);
    // 400 shares, $10,000 loan. At $35.75: equity 4,300 / 14,300 ≈ 30.07%; at $35.50 it is 29.6%.
    expect(checkMargin(a, () => 35.75, 3).event).toBeNull();
    const called = checkMargin(a, () => 35.5, 3);
    expect(called.event?.kind).toBe('call');
    expect(called.state.marginCall?.day).toBe(3);
    expect(checkMargin(called.state, () => 35.5, 3).event).toBeNull();
    const due = checkMargin(called.state, () => 35, 4);
    expect(due.event?.kind).toBe('due');
    expect(due.state.forcedSaleDue).toBe(true);
    const met = checkMargin(called.state, () => 45, 4);
    expect(met.event?.kind).toBe('met');
    expect(met.state.marginCall).toBeNull();
    expect(met.state.marginCalls).toHaveLength(1);
  });

  it('a forced sale fills at the gapped open and restores 40%', () => {
    let a = buy(createAccount(MARGIN), 'KO', 10_000, 50);
    a = buy(a, 'PEP', 10_000, 100, () => 50);
    a = { ...checkMargin(a, () => 35, 2).state };
    a = { ...a, forcedSaleDue: true };
    const quote = (t: string) => ({ mid: t === 'KO' ? 34 : 70, half: 0.001 });
    const r = forceSale(a, quote, { day: 4, bar: 0 });
    expect(r.fills.length).toBeGreaterThan(0);
    for (const f of r.fills) {
      expect(f.forced).toBe(true);
      expect(f.side).toBe('sell');
    }
    // PEP is the bigger holding at the open (100 × 70 vs 200 × 34), so it goes first.
    expect(r.fills[0]?.ticker).toBe('PEP');
    expect(r.fills[0]?.price).toBeCloseTo(70 * 0.999, 9);
    expect(marginRatio(r.state, (t) => quote(t).mid)).toBeGreaterThanOrEqual(0.4 - 1e-6);
    expect(marginRatio(r.state, (t) => quote(t).mid)).toBeLessThan(0.42);
    expect(r.state.marginCall).toBeNull();
    expect(r.state.forcedSaleDue).toBe(false);
    expect(exposure(r.state.cash, r.state.positions).gross).toBeGreaterThan(0);
  });
});

describe('margin in a run', () => {
  const covid = buildMarket(getScenario('covid-2020'), 21, UNIVERSE);

  // Playing 2x SPY through the whole COVID scenario takes a few seconds on a CI runner.
  const SLOW = 30_000;
  let shared: Run | null = null;
  const sharedRun = () => (shared ??= leveredSpy());

  function leveredSpy(): Run {
    const run = new Run(covid, { ...DEFAULT_ACCOUNT_SETTINGS, margin: true }, undefined, { pauseAtClose: false });
    const r = run.place({ ticker: 'SPY', side: 'buy', type: 'market', amount: { kind: 'dollars', value: 19_900 } });
    expect(r.status).toBe('filled');
    while (!run.finished) run.stepDay();
    return run;
  }

  it('2x SPY through the COVID crash gets a margin call, a forced sale, and the grade shows it', () => {
    const run = sharedRun();
    expect(run.account.marginCalls.length).toBeGreaterThan(0);
    expect(run.account.interestPaid).toBeGreaterThan(0);
    expect(run.alerts.map((a) => a.kind)).toContain('marginCall');
    const forced = run.account.fills.filter((f) => f.forced);
    expect(forced.length).toBeGreaterThan(0);
    // The sale happens at an open, after the call's deadline close.
    const call = run.account.marginCalls[0];
    expect(forced[0]?.at.bar).toBe(0);
    expect(forced[0]?.at.day).toBeGreaterThanOrEqual((call?.day ?? 0) + 2);

    const d = debrief(run);
    expect(d.marginCalls).toBe(run.account.marginCalls.length);
    expect(d.forcedSales).toBeGreaterThan(0);
    expect(d.avgLeverage).toBeGreaterThan(1.5);
    expect(d.interest).toBeCloseTo(run.account.interestPaid, 9);
    expect(d.grade.score).toBeLessThan(70);
    expect(d.moments.map((m) => m.kind)).toContain('forcedSale');
  }, SLOW);

  it('is deterministic', () => {
    const a = sharedRun();
    const b = leveredSpy();
    expect(b.account.equityByDay).toEqual(a.account.equityByDay);
    expect(b.account.fills).toEqual(a.account.fills);
  }, SLOW);

  it('pauses the clock at the close where a call is made', () => {
    const run = new Run(covid, { ...DEFAULT_ACCOUNT_SETTINGS, margin: true }, undefined, { pauseAtClose: false });
    run.place({ ticker: 'SPY', side: 'buy', type: 'market', amount: { kind: 'dollars', value: 19_900 } });
    run.play(true);
    while (!run.finished && !run.account.marginCall) {
      run.step();
      if (!run.clock.playing) break;
    }
    expect(run.account.marginCall).not.toBeNull();
    expect(run.clock.playing).toBe(false);
  }, SLOW);
});

describe('grade with leverage', () => {
  const base = {
    ret: 0.1,
    spyRet: 0.05,
    years: 0.25,
    dd: 0.05,
    spyDd: 0.05,
    costShare: 0,
    panicSells: 0,
    maxWeight: 0,
    tradesPerDay: 0.1,
    avgInvested: 1,
    bust: false,
  };

  it('takes points for leverage and margin calls, and caps a forced sale at C+', () => {
    const clean = gradeRun(base);
    expect(gradeRun({ ...base, avgLeverage: 1.8 }).discipline).toBe(clean.discipline - 5);
    expect(gradeRun({ ...base, marginCalls: 1 }).discipline).toBe(clean.discipline - 5);
    expect(gradeRun({ ...base, marginCalls: 4 }).discipline).toBe(clean.discipline - 10);
    const forced = gradeRun({ ...base, forcedSales: 1 });
    expect(forced.score).toBeLessThan(70);
    expect(forced.letter).toBe('C+');
  });
});
