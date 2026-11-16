import { describe, expect, it } from 'vitest';
import { UNIVERSE } from '../data/universe';
import { DEFAULT_ACCOUNT_SETTINGS } from './account';
import { debrief } from './debrief';
import { BARS_PER_DAY } from './intraday';
import { buildMarket } from './market';
import type { OrderDraft } from './orders';
import { Run } from './run';
import {
  checkSave,
  dropUnlisted,
  encodeSnapshots,
  type RunSave,
  restoreRun,
  SAVE_FORMAT,
  SaveError,
  saveRun,
} from './save';
import { getScenario } from './scenarios';

const first = buildMarket(getScenario('first-steps'), 7, UNIVERSE);
const SOURCE = { scenarioId: 'first-steps', seed: 7 };

type Script = Record<number, OrderDraft[]>;

const SCRIPT: Script = {
  0: [{ ticker: 'SPY', side: 'buy', type: 'market', amount: { kind: 'dollars', value: 5_000 } }],
  3: [{ ticker: 'AAPL', side: 'buy', type: 'market', amount: { kind: 'dollars', value: 2_000 } }],
  8: [
    {
      ticker: 'AAPL',
      side: 'sell',
      type: 'stop',
      stopPrice: 1,
      amount: { kind: 'shares', value: 1 },
      tif: 'gtc',
    },
  ],
  15: [{ ticker: 'SPY', side: 'sell', type: 'market', amount: { kind: 'shares', value: 3 } }],
  25: [
    {
      ticker: 'MSFT',
      side: 'buy',
      type: 'limit',
      limitPrice: 1_000,
      amount: { kind: 'dollars', value: 1_000 },
    },
  ],
};

function fresh(): Run {
  return new Run(first, undefined, undefined, { pauseAtClose: false });
}

/** Step until the clock reaches (day, bar), placing each day's orders at its open. */
function walk(run: Run, script: Script, day = Infinity, bar = 0): Run {
  while (!run.finished && !(run.clock.day === day && run.clock.bar === bar)) {
    if (run.clock.bar === 0) for (const d of script[run.clock.day] ?? []) run.place(d);
    run.step();
  }
  return run;
}

/** Through JSON, like an exported file. */
function viaJson(save: RunSave): RunSave {
  return JSON.parse(JSON.stringify(save)) as RunSave;
}

describe('run saves', () => {
  const original = walk(fresh(), SCRIPT);

  it('a run saved mid-day and restored plays on exactly like the original', () => {
    for (const [day, bar] of [
      [0, 0],
      [3, 1],
      [8, 40],
      [15, BARS_PER_DAY],
      [30, 12],
    ] as const) {
      const part = walk(fresh(), SCRIPT, day, bar);
      const restored = restoreRun(first, viaJson(saveRun(part, SOURCE)));
      expect(restored.clock.playing).toBe(false);
      expect(restored.clock.day).toBe(day);
      expect(restored.clock.bar).toBe(bar);
      expect(restored.account).toEqual(part.account);
      walk(restored, SCRIPT);
      expect(restored.account).toEqual(original.account);
      expect(debrief(restored)).toEqual(debrief(original));
    }
  }, 30_000);

  it('keeps a finished run, its debrief and its replay points', () => {
    const restored = restoreRun(first, viaJson(saveRun(original, SOURCE)));
    expect(restored.finished).toBe(true);
    expect(restored.endReason).toBe(original.endReason);
    expect(debrief(restored)).toEqual(debrief(original));
    for (const day of [0, 8, 15, first.dates.length - 2])
      expect(restored.accountAtClose(day)).toEqual(original.accountAtClose(day));
    const a = original.branch(15, { letter: 'B', score: 75 });
    const b = restored.branch(15, { letter: 'B', score: 75 });
    expect(b.account).toEqual(a.account);
    expect(walk(b, SCRIPT).account).toEqual(walk(a, SCRIPT).account);
  }, 30_000);

  it('keeps settings, options, alerts and the branch', () => {
    const covid = buildMarket(getScenario('covid-2020'), 3, UNIVERSE);
    const settings = { ...DEFAULT_ACCOUNT_SETTINGS, margin: true };
    const run = new Run(covid, settings, 7_500, { pauseAtClose: true, targetReturn: 0.5 });
    run.place({
      ticker: 'SPY',
      side: 'buy',
      type: 'market',
      amount: { kind: 'dollars', value: 19_000 },
    });
    while (!run.finished && run.clock.day < 60) run.stepDay();
    const branched = run.branch(40, { letter: 'D', score: 40 });
    walk(branched, {}, 45, BARS_PER_DAY);
    const save = viaJson(saveRun(branched, { scenarioId: 'covid-2020', seed: 3 }));
    const back = restoreRun(covid, save);
    expect(back.account.settings).toEqual(settings);
    expect(back.pauseAtClose).toBe(true);
    expect(back.targetReturn).toBe(0.5);
    expect(back.clock.dayLengthMs).toBe(7_500);
    expect(back.alerts).toEqual(branched.alerts);
    expect(back.branchOf).toEqual({ day: 40, letter: 'D', score: 40 });
    walk(back, {});
    walk(branched, {});
    expect(back.account).toEqual(branched.account);
    expect(back.alerts).toEqual(branched.alerts);
  }, 30_000);

  it('stores unchanged positions once', () => {
    const save = saveRun(original, SOURCE);
    const copies = save.snapshots.filter((s) => typeof s.positions === 'object').length;
    // One copy per change of holdings, not one per close.
    expect(copies).toBeLessThan(10);
    expect(save.snapshots.length).toBe(first.dates.length);
  });

  it('encodes any range of closes on its own, matching the whole', () => {
    const all = encodeSnapshots(original.snapshots);
    const parts = [0, 10, 20, 40, original.snapshots.length];
    const joined = parts
      .slice(1)
      .flatMap((to, i) => encodeSnapshots(original.snapshots, parts[i], to));
    expect(joined).toEqual(all);
    const save = { ...saveRun(original, SOURCE, false), snapshots: joined };
    expect(restoreRun(first, viaJson(save)).accountAtClose(30)).toEqual(
      original.accountAtClose(30),
    );
  });

  it('is deterministic', () => {
    expect(JSON.stringify(saveRun(original, SOURCE))).toBe(
      JSON.stringify(saveRun(walk(fresh(), SCRIPT), SOURCE)),
    );
  }, 30_000);

  it('rejects saves that do not fit, with a plain message', () => {
    const good = saveRun(walk(fresh(), SCRIPT, 10, 5), SOURCE);
    const bad = (patch: (s: RunSave) => void) => {
      const s = viaJson(good);
      patch(s);
      return () => restoreRun(first, s);
    };
    expect(bad((s) => (s.format = SAVE_FORMAT + 1))).toThrow(/newer version/);
    expect(bad((s) => (s.format = 0))).toThrow(/older version/);
    expect(bad((s) => (s.source.seed = 8))).toThrow(/different market/);
    expect(bad((s) => (s.clock.day = 999))).toThrow(/outside the market/);
    expect(bad((s) => s.account.equityByDay.pop())).toThrow(/closes/);
    expect(bad((s) => (s.account.positions.NOPE = { shares: 1, costBasis: 1 }))).toThrow(/NOPE/);
    expect(bad((s) => ((s.snapshots[2] as { positions: number }).positions = 5))).toThrow(
      /later one/,
    );
    expect(bad(() => {})).not.toThrow();
    expect(bad((s) => (s.format = 0))).toThrow(SaveError);
  });

  it('closes positions in a corrected listing at cost, everywhere', () => {
    const good = saveRun(walk(fresh(), SCRIPT, 10, 5), SOURCE);
    expect(dropUnlisted(good, first)).toEqual({ save: good, dropped: [] });
    const old = viaJson(good);
    const mara = { shares: 10, costBasis: 250 };
    old.account.positions.MARA = mara;
    old.account.orders.push({
      ...(old.account.orders[0] as RunSave['account']['orders'][number]),
      id: 99,
      ticker: 'MARA',
      status: 'open',
    });
    // Close 4 holds it; close 5 points back at close 4.
    const s4 = old.snapshots[4] as RunSave['snapshots'][number];
    s4.positions = { ...(s4.positions as Record<string, typeof mara>), MARA: mara };
    (old.snapshots[5] as RunSave['snapshots'][number]).positions = 4;
    // First steps lists MARA; an early scenario wouldn't.
    const early = { ...first, instruments: first.instruments.filter((i) => i.ticker !== 'MARA') };
    expect(() => checkSave(old, early)).toThrow(/MARA/);
    expect(dropUnlisted(old, first).dropped).toEqual([]);
    const { save, dropped } = dropUnlisted(old, early);
    expect(dropped).toEqual(['MARA']);
    expect(save.account.cash).toBeCloseTo(good.account.cash + 250, 6);
    expect(save.account.positions.MARA).toBeUndefined();
    expect(save.account.orders.find((o) => o.id === 99)?.status).toBe('cancelled');
    for (const i of [4, 5])
      expect(save.snapshots[i]?.state.cash).toBeCloseTo(
        (old.snapshots[i]?.state.cash ?? 0) + 250,
        6,
      );
    expect(save.snapshots[3]).toBe(old.snapshots[3]);
    const run = restoreRun(first, save);
    expect(run.snapshots[5]?.state.positions.MARA).toBeUndefined();
    // Unknown tickers that were never corrected still fail.
    old.account.positions.NOPE = mara;
    expect(() => checkSave(dropUnlisted(old, early).save, early)).toThrow(/NOPE/);
  });
});
