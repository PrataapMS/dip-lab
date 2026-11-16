import { describe, expect, it } from 'vitest';
import { UNIVERSE } from '../data/universe';
import { DEFAULT_ACCOUNT_SETTINGS } from './account';
import { BARS_PER_DAY } from './intraday';
import { buildMarket } from './market';
import { nextEvent, SKIP_MAX_DAYS } from './nextEvent';
import { Run } from './run';
import { getScenario } from './scenarios';

const first = buildMarket(getScenario('first-steps'), 7, UNIVERSE);
const covid = buildMarket(getScenario('covid-2020'), 21, UNIVERSE);
const none = new Set<string>();

function fresh(market = first, margin = false): Run {
  return new Run(market, { ...DEFAULT_ACCOUNT_SETTINGS, margin }, undefined, {
    pauseAtClose: false,
  });
}

describe('next event', () => {
  it('finds the next earnings of a followed stock and stops the close before it', () => {
    const aapl = first.events.find((e) => e.kind === 'earnings' && e.ticker === 'AAPL');
    expect(aapl).toBeDefined();
    const day = (aapl?.day ?? 0) - 5;
    const next = nextEvent(first, day, false, new Set(['AAPL']));
    // A headline may come first; with AAPL followed its report is never skipped over.
    expect(next).not.toBeNull();
    expect(next?.stopDay).toBeLessThanOrEqual((aapl?.day ?? 0) - 1);
    if (next?.kind === 'earnings') expect(next).toMatchObject({ ticker: 'AAPL', stopDay: day + 4 });
  });

  it('ignores stocks nobody follows and company news', () => {
    for (let day = 0; day < first.dates.length - 1; day += 7) {
      const next = nextEvent(first, day, false, none);
      expect(['headline', 'lastDay']).toContain(next?.kind);
    }
  });

  it('includes ex-dividend days of followed stocks', () => {
    const div = first.dividends.find((d) => d.day > 3);
    expect(div).toBeDefined();
    const next = nextEvent(first, (div?.day ?? 0) - 2, true, new Set([div?.ticker ?? '']));
    expect(next?.stopDay).toBeLessThanOrEqual((div?.day ?? 0) - 1);
  });

  it('moves on once at the close before an event, and stops at the last day', () => {
    const last = first.dates.length - 1;
    const e = nextEvent(first, 0, false, new Set(['AAPL', 'MSFT', 'KO']));
    if (e && e.stopDay >= 0) {
      const after = nextEvent(first, e.stopDay, true, new Set(['AAPL', 'MSFT', 'KO']));
      expect(after?.stopDay).toBeGreaterThan(e.stopDay);
    }
    expect(nextEvent(first, last - 1, true, none)).toMatchObject({
      kind: 'lastDay',
      stopDay: last,
    });
    expect(nextEvent(first, last, true, none)).toBeNull();
  });

  it('looks at most SKIP_MAX_DAYS ahead', () => {
    for (let day = 0; day < covid.dates.length - 1; day += 11) {
      const next = nextEvent(covid, day, false, none);
      if (next) expect(next.stopDay - day).toBeLessThanOrEqual(SKIP_MAX_DAYS);
    }
  });
});

describe('skipping ahead', () => {
  it('ends in exactly the state playing bar by bar gives', () => {
    const a = fresh();
    const b = fresh();
    for (const r of [a, b])
      r.place({
        ticker: 'SPY',
        side: 'buy',
        type: 'market',
        amount: { kind: 'dollars', value: 4_000 },
      });
    const res = a.skipTo(12);
    expect(res.stop).toBe('close');
    expect(a.clock).toMatchObject({ day: 12, bar: BARS_PER_DAY, playing: false });
    while (!(b.clock.day === 12 && b.clock.bar === BARS_PER_DAY)) b.step();
    expect(a.account).toEqual(b.account);
    expect(a.snapshots).toEqual(b.snapshots);
  });

  it('stops right after a fill', () => {
    const run = fresh();
    const order = run.place({
      ticker: 'SPY',
      side: 'buy',
      type: 'stop',
      stopPrice: run.mid(run.indexOf('SPY') ?? 0) * 1.01,
      amount: { kind: 'dollars', value: 1_000 },
      tif: 'gtc',
    });
    expect(order.status).toBe('open');
    const res = run.skipTo(first.dates.length - 1);
    expect(run.account.fills).toHaveLength(1);
    expect(res.stop).toBe('fill');
    expect(res.changed.map((o) => o.status)).toEqual(['filled']);
    expect(run.clock.playing).toBe(false);
    expect(run.finished).toBe(false);
  });

  it('stops at a margin call', () => {
    const run = fresh(covid, true);
    run.place({
      ticker: 'SPY',
      side: 'buy',
      type: 'market',
      amount: { kind: 'dollars', value: 19_900 },
    });
    let res = run.skipTo(run.clock.day);
    for (let i = 0; i < 20 && res.stop === 'close'; i++) {
      res = run.skipTo(Math.min(run.clock.day + 10, covid.dates.length - 1));
    }
    expect(res.stop).toBe('marginCall');
    expect(run.account.marginCall).not.toBeNull();
  });

  it('stops when the run ends', () => {
    const run = fresh();
    expect(run.skipTo(first.dates.length - 1).stop).toBe('end');
    expect(run.finished).toBe(true);
    expect(run.skipTo(first.dates.length - 1).stop).toBe('end');
  });
});
