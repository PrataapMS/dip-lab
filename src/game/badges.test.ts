import { describe, expect, it } from 'vitest';
import { UNIVERSE } from '../data/universe';
import type { Activity, HoldingFact } from '../engine/activity';
import { type Debrief, debrief, highlights } from '../engine/debrief';
import { buildMarket } from '../engine/market';
import { Run } from '../engine/run';
import { getScenario } from '../engine/scenarios';
import { BADGES, cameBack, newBadges } from './badges';
import { applyActivity, emptyProgress, type Progress } from './progress';

const DATE = '2026-11-16';
const CTX = { lessonCount: 12 };

const first = buildMarket(getScenario('first-steps'), 7, UNIVERSE);
const covid = buildMarket(getScenario('covid-2020'), 21, UNIVERSE);

function played(market = first, script: (run: Run) => void = () => {}): Run {
  const run = new Run(market, undefined, undefined, { pauseAtClose: false });
  script(run);
  while (!run.finished) run.stepDay();
  return run;
}

const base: Debrief = debrief(played(first, (r) => r.place({ ticker: 'SPY', side: 'buy', type: 'market', amount: { kind: 'dollars', value: 9_000 } })));

const end = (d: Partial<Debrief>, over: Partial<Extract<Activity, { kind: 'runEnd' }>> = {}): Activity => ({
  kind: 'runEnd',
  debrief: { ...base, ...d },
  difficulty: 1,
  complete: true,
  margin: false,
  ...over,
});

const ids = (a: Activity, p: Progress = emptyProgress()) => newBadges(a, p, CTX).map((b) => b.id);

describe('badges', () => {
  it('has 24 with unique ids', () => {
    expect(BADGES).toHaveLength(24);
    expect(new Set(BADGES.map((b) => b.id)).size).toBe(24);
  });

  it('earns First trade on a fill, once, with XP', () => {
    const fill: Activity = { kind: 'fill', ticker: 'KO', side: 'buy', orderType: 'market', etf: false, short: false, forced: false, realised: 0, day: 0 };
    const r = applyActivity(emptyProgress(), fill, DATE, CTX);
    expect(r.progress.badges['first-trade']).toBe(DATE);
    expect(r.rewards).toContainEqual({ source: 'badge', label: 'Badge: First trade', xp: 50, id: 'first-trade' });
    expect(applyActivity(r.progress, fill, DATE, CTX).rewards.filter((x) => x.source === 'badge')).toEqual([]);
  });

  it('counts limit fills and dividend payers across runs', () => {
    let p = emptyProgress();
    const fill: Activity = { kind: 'fill', ticker: 'KO', side: 'buy', orderType: 'limit', etf: false, short: false, forced: false, realised: 0, day: 0 };
    for (let k = 0; k < 10; k++) p = applyActivity(p, fill, DATE, CTX).progress;
    expect(p.badges['limit-legend']).toBe(DATE);
    const close = (tickers: string[]): Activity => ({
      kind: 'close',
      day: 1,
      value: 1,
      prevValue: 1,
      dayPct: 0,
      spyPct: 0,
      holdings: [],
      dividends: 1,
      dividendTickers: tickers,
      earningsHeld: [],
    });
    p = applyActivity(p, close(['A', 'B', 'C', 'D', 'E']), DATE, CTX).progress;
    p = applyActivity(p, close(['A', 'F', 'G', 'H', 'I']), DATE, CTX).progress;
    expect(p.badges['dividend-collector']).toBeUndefined();
    p = applyActivity(p, close(['J']), DATE, CTX).progress;
    expect(p.badges['dividend-collector']).toBe(DATE);
  });

  it('Diversified needs 8 holdings, 5 sectors and none over 20%', () => {
    const sectors = ['Energy', 'Financials', 'Health Care', 'Utilities', 'Materials', 'Energy', 'Financials', 'Health Care'];
    const h = (k: number, value: number): HoldingFact => ({ ticker: `T${k}`, sector: sectors[k] ?? null, etf: false, shares: 1, value, heldDays: 1 });
    const close = (holdings: HoldingFact[]): Activity => ({
      kind: 'close',
      day: 1,
      value: 1_000,
      prevValue: 1_000,
      dayPct: 0,
      spyPct: 0,
      holdings,
      dividends: 0,
      dividendTickers: [],
      earningsHeld: [],
    });
    expect(ids(close(sectors.map((_, k) => h(k, 100))))).toContain('diversified');
    expect(ids(close(sectors.map((_, k) => h(k, k === 0 ? 250 : 100))))).not.toContain('diversified');
    expect(ids(close(sectors.slice(0, 7).map((_, k) => h(k, 100))))).not.toContain('diversified');
  });

  it('checks run results', () => {
    expect(ids(end({ excessPts: 1 }))).toContain('index-slayer');
    expect(ids(end({ excessPts: -1 }))).not.toContain('index-slayer');
    expect(ids(end({ excessPts: 1, days: 15 }))).not.toContain('index-slayer');
    expect(ids(end({}))).toContain('graduate');
    expect(ids(end({}, { complete: false }))).not.toContain('graduate');
    expect(ids(end({ grade: { ...base.grade, letter: 'A', score: 92 } }))).toContain('straight-a');
    expect(ids(end({ grade: { ...base.grade, score: 80 } }, { difficulty: 4 }))).toContain('boss-slayer');
    expect(ids(end({ grade: { ...base.grade, score: 70 } }, { difficulty: 4 }))).not.toContain('boss-slayer');
    expect(ids(end({ scenarioId: 'covid-2020', worstDrawdown: 0.2, spyWorstDrawdown: 0.33, avgInvested: 0.9 }))).toContain('crash-tested');
    expect(ids(end({ scenarioId: 'dot-com', excessPts: 3 }))).toContain('bubble-dodger');
    expect(ids(end({ scenarioId: 'meme-squeeze', grade: { ...base.grade, score: 61 } }))).toContain('meme-survivor');
    expect(ids(end({ you: [10_000, 8_900, 10_100] }))).toContain('survivor');
    expect(ids(end({ you: [10_000, 9_500, 10_100] }))).not.toContain('survivor');
    expect(ids(end({ spyWorstDrawdown: 0.25, panicSells: 0 }))).toContain('steady-hands');
    expect(ids(end({ spyWorstDrawdown: 0.25, panicSells: 1 }))).not.toContain('steady-hands');
    expect(ids(end({ avgLeverage: 1.6, marginCalls: 0 }, { margin: true }))).toContain('margin-survivor');
    expect(ids(end({ avgLeverage: 1.6, marginCalls: 1 }, { margin: true }))).not.toContain('margin-survivor');
    expect(ids(end({ branchOf: { day: 3, letter: 'C', score: 61 }, grade: { ...base.grade, letter: 'B', score: 76 } }))).toContain('replay-pro');
    expect(ids(end({ reason: 'bust', excessPts: 1 }))).not.toContain('index-slayer');
  });

  it('Low cost and Comeback', () => {
    expect(base.days).toBeGreaterThanOrEqual(60);
    expect(ids(end({ fees: 0, spread: 1, interest: 0, borrowFees: 0, trades: 1 }))).toContain('low-cost');
    expect(ids(end({ fees: 0, spread: 50, trades: 1 }))).not.toContain('low-cost');
    expect(cameBack([100, 84, 90, 101], 0.15)).toBe(true);
    expect(cameBack([100, 84, 90, 99], 0.15)).toBe(false);
    expect(cameBack([100, 90, 120], 0.15)).toBe(false);
  });

  it('habits: streak, quests and lessons', () => {
    const p = { ...emptyProgress(), streak: { count: 7, best: 7, last: DATE }, counters: { questsDone: 20 }, lessons: Object.fromEntries(Array.from({ length: 12 }, (_, k) => [`l${k}`, true as const])) };
    const got = ids({ kind: 'replay', day: 1 }, p);
    expect(got).toEqual(expect.arrayContaining(['week-streak', 'quest-hunter', 'scholar']));
    expect(newBadges({ kind: 'replay', day: 1 }, p, { lessonCount: 0 }).map((b) => b.id)).not.toContain('scholar');
  });

  it('Short seller needs a profitable cover', () => {
    const cover = (realised: number): Activity => ({ kind: 'fill', ticker: 'X', side: 'buy', orderType: 'market', etf: false, short: true, forced: false, realised, day: 2 });
    expect(ids(cover(10))).toContain('short-seller');
    expect(ids(cover(-10))).not.toContain('short-seller');
  });
});

describe('highlights in a real run', () => {
  const spyCloses = covid.closes[covid.instruments.findIndex((i) => i.ticker === 'SPY')] ?? new Float64Array();
  let low = 1;
  for (let k = 1; k < spyCloses.length; k++) if ((spyCloses[k] ?? 0) < (spyCloses[low] ?? 0)) low = k;

  it('finds a bought dip at the COVID low', () => {
    const run = played(covid, (r) => {
      while (r.clock.day < low - 1) r.stepDay();
      r.place({ ticker: 'SPY', side: 'buy', type: 'market', amount: { kind: 'dollars', value: 5_000 } });
    });
    expect(highlights(run).boughtDip).toBe('SPY');
  });

  it('finds diamond hands when SPY is held through the crash and ends ahead', () => {
    const run = played(covid, (r) => r.place({ ticker: 'SPY', side: 'buy', type: 'market', amount: { kind: 'dollars', value: 5_000 } }));
    const endUp = (spyCloses[spyCloses.length - 1] ?? 0) > (spyCloses[1] ?? 0);
    expect(endUp).toBe(true);
    expect(highlights(run).diamondHands).toBe(endUp ? 'SPY' : null);
    expect(highlights(run).boughtDip).toBeNull();
  });

  it('finds a stop-loss that saved you', () => {
    const run = played(covid, (r) => {
      r.place({ ticker: 'SPY', side: 'buy', type: 'market', amount: { kind: 'shares', value: 10 } });
      r.place({ ticker: 'SPY', side: 'sell', type: 'stop', stopPrice: r.mid(r.indexInstrument) * 0.92, tif: 'gtc', amount: { kind: 'shares', value: 10 } });
    });
    expect(run.account.fills).toHaveLength(2);
    expect(highlights(run).stopSaved).toBe('SPY');
  });
});
