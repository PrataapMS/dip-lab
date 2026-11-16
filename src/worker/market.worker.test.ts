import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Command, WorkerEvent } from '../engine/protocol';

const events: WorkerEvent[] = [];
const scope: { postMessage: (e: WorkerEvent) => void; onmessage: ((e: { data: Command }) => void) | null } = {
  postMessage: (e) => events.push(e),
  onmessage: null,
};

function send(cmd: Command): void {
  scope.onmessage?.({ data: cmd });
}

function last<T extends WorkerEvent['type']>(type: T): Extract<WorkerEvent, { type: T }> {
  const found = [...events].reverse().find((e) => e.type === type);
  if (!found) throw new Error(`no ${type} event`);
  return found as Extract<WorkerEvent, { type: T }>;
}

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
  (globalThis as unknown as { self: typeof scope }).self = scope;
  await import('./market.worker');
});

afterEach(() => {
  events.length = 0;
});

describe('market worker', () => {
  it('loads a scenario and posts the first day and tick', () => {
    send({ type: 'newRun', scenarioId: 'covid-2020', seed: 7 });
    expect(events.map((e) => e.type)).toEqual(['loaded', 'day', 'tick', 'news', 'account']);
    const loaded = last('loaded');
    expect(loaded.dates[0]).toBe('2020-02-20');
    expect(loaded.instruments[loaded.indexInstrument]?.ticker).toBe('SPY');
    const tick = last('tick');
    expect([tick.day, tick.bar, tick.playing]).toEqual([0, 0, false]);
    expect(tick.prices).toHaveLength(loaded.instruments.length);
  });

  it('ticks while playing and stops when paused', () => {
    send({ type: 'newRun', scenarioId: 'covid-2020', seed: 7 });
    send({ type: 'speed', dayLengthMs: 5_000 });
    send({ type: 'play' });
    vi.advanceTimersByTime(5_000 / 79 * 10 + 50);
    const tick = last('tick');
    expect(tick.playing).toBe(true);
    expect(tick.bar).toBeGreaterThanOrEqual(9);
    expect(tick.indexToday).toHaveLength(tick.bar + 1);
    send({ type: 'pause' });
    const paused = events.length;
    vi.advanceTimersByTime(5_000);
    expect(events.length).toBe(paused);
  });

  it('replays the same prices for the same seed', () => {
    send({ type: 'newRun', scenarioId: 'gfc-2008', seed: 3 });
    send({ type: 'stepDay' });
    const a = Array.from(last('tick').prices);
    send({ type: 'newRun', scenarioId: 'gfc-2008', seed: 3 });
    send({ type: 'stepDay' });
    expect(Array.from(last('tick').prices)).toEqual(a);
  });

  it('moves to the next day and sends its previous closes', () => {
    send({ type: 'newRun', scenarioId: 'first-steps', seed: 1 });
    send({ type: 'stepDay' });
    const close = last('tick').prices;
    send({ type: 'stepDay' });
    const day = last('day');
    expect(day.day).toBe(1);
    expect(Array.from(day.prevCloses)).toEqual(Array.from(close));
    expect(day.indexHistory).toHaveLength(2);
  });

  it('fills a market buy and reports it in the account', () => {
    send({ type: 'newRun', scenarioId: 'first-steps', seed: 5 });
    send({ type: 'placeOrder', draft: { ticker: 'NVDA', side: 'buy', type: 'market', amount: { kind: 'dollars', value: 1_000 } } });
    const result = last('orderResult');
    expect(result.ok).toBe(true);
    expect(result.message).toMatch(/^Bought [\d.]+ shares of NVDA at \$/);
    const account = last('account').account;
    expect(account.cash).toBeCloseTo(9_000, 2);
    expect(account.positions.map((p) => p.ticker)).toEqual(['NVDA']);
    expect(account.recentFills).toHaveLength(1);
  });

  it('fills a resting limit while playing and posts the update', () => {
    send({ type: 'newRun', scenarioId: 'first-steps', seed: 5 });
    const loaded = last('loaded');
    const i = loaded.instruments.findIndex((x) => x.ticker === 'KO');
    const price = last('tick').prices[i] ?? 0;
    send({
      type: 'placeOrder',
      draft: { ticker: 'KO', side: 'buy', type: 'limit', limitPrice: price * 0.999, tif: 'gtc', amount: { kind: 'shares', value: 2 } },
    });
    expect(last('orderResult').message).toMatch(/^Order placed: Buy 2 shares of KO at \$[\d.]+ or less\.$/);
    expect(last('account').account.openOrders).toHaveLength(1);
    send({ type: 'speed', dayLengthMs: 7_500 });
    send({ type: 'play' });
    for (let t = 0; t < 300 && !events.some((e) => e.type === 'orderUpdates'); t++) vi.advanceTimersByTime(1_000);
    send({ type: 'pause' });
    const update = last('orderUpdates').orders[0];
    expect(update?.status).toBe('filled');
    expect(update?.fillPrice).toBeLessThanOrEqual(price * 0.999);
    expect(last('account').account.openOrders).toHaveLength(0);
  });

  it('cancels an open order', () => {
    send({ type: 'newRun', scenarioId: 'first-steps', seed: 5 });
    send({ type: 'placeOrder', draft: { ticker: 'KO', side: 'buy', type: 'limit', limitPrice: 1, amount: { kind: 'shares', value: 1 } } });
    const id = last('orderResult').order?.id ?? -1;
    send({ type: 'cancelOrder', id });
    expect(last('orderResult')).toMatchObject({ ok: true, message: 'Cancelled: Buy 1 share of KO at $1.00 or less.' });
    send({ type: 'cancelOrder', id });
    expect(last('orderResult').ok).toBe(false);
  });

  it('sends watchlist sparklines and the inspected ticker', () => {
    send({ type: 'newRun', scenarioId: 'first-steps', seed: 5 });
    send({ type: 'watch', tickers: ['AAPL', 'NOPE'] });
    send({ type: 'inspect', ticker: 'AAPL' });
    for (let d = 0; d < 3; d++) send({ type: 'stepDay' });
    const day = last('day');
    expect(day.watch.map((w) => w.ticker)).toEqual(['AAPL']);
    expect(day.watch[0]?.values).toHaveLength(day.day + 1);
    const history = last('history');
    expect(history.ticker).toBe('AAPL');
    expect(history.closes).toHaveLength(day.day + 1);
    expect(last('tick').focus?.values).toHaveLength(79);
    send({ type: 'inspect', ticker: null });
  });

  it('replays the same account for the same seed and orders', () => {
    const play = () => {
      send({ type: 'newRun', scenarioId: 'covid-2020', seed: 9 });
      send({ type: 'placeOrder', draft: { ticker: 'SPY', side: 'buy', type: 'market', amount: { kind: 'dollars', value: 5_000 } } });
      send({ type: 'placeOrder', draft: { ticker: 'SPY', side: 'sell', type: 'stop', stopPrice: 300, tif: 'gtc', amount: { kind: 'shares', value: 5 } } });
      for (let d = 0; d < 15; d++) send({ type: 'stepDay' });
      return last('account').account;
    };
    const a = play();
    expect(a.equityByDay).toHaveLength(15);
    expect(play()).toEqual(a);
  });

  it('sends the intro headline, news about holdings and dividends received', () => {
    send({ type: 'newRun', scenarioId: 'first-steps', seed: 5 });
    expect(last('news').items[0]).toMatchObject({ kind: 'headline', day: 0, bar: 0 });
    send({ type: 'placeOrder', draft: { ticker: 'SPY', side: 'buy', type: 'market', amount: { kind: 'shares', value: 5 } } });
    send({ type: 'placeOrder', draft: { ticker: 'KO', side: 'buy', type: 'market', amount: { kind: 'shares', value: 5 } } });
    events.length = 0;
    for (let d = 0; d < 60; d++) send({ type: 'stepDay' });
    const items = events.flatMap((e) => (e.type === 'news' ? e.items : []));
    expect(items.some((n) => n.kind === 'dividend' && n.ticker === 'SPY' && n.mine)).toBe(true);
    expect(items.some((n) => n.kind === 'earnings' && n.ticker === 'KO' && n.mine)).toBe(true);
    const days = items.map((n) => n.day);
    expect(days).toEqual([...days].sort((a, b) => a - b));
  });

  it('sends a ticker its news and upcoming dates', () => {
    send({ type: 'newRun', scenarioId: 'first-steps', seed: 5 });
    send({ type: 'inspect', ticker: 'KO' });
    const h = last('history');
    expect(h.news).toEqual([]);
    expect(h.upcoming.earnings).toBeGreaterThan(0);
    expect(h.upcoming.exDividend).toBeGreaterThan(0);
    send({ type: 'inspect', ticker: null });
  });

  it('summarises each close and ends the run on request', () => {
    send({ type: 'newRun', scenarioId: 'first-steps', seed: 5 });
    send({ type: 'stepDay' });
    expect(last('dayEnd').summary.day).toBe(0);
    expect(last('tick').pauseAtClose).toBe(true);
    send({ type: 'pauseAtClose', on: false });
    expect(last('tick').pauseAtClose).toBe(false);
    send({ type: 'end' });
    expect(last('ended').reason).toBe('ended');
    expect(last('ended').debrief).toMatchObject({ scenarioId: 'first-steps', seed: 5, reason: 'ended', trades: 0 });
    expect(last('tick')).toMatchObject({ finished: true, endReason: 'ended' });
    send({ type: 'placeOrder', draft: { ticker: 'KO', side: 'buy', type: 'market', amount: { kind: 'dollars', value: 10 } } });
    expect(last('orderResult').ok).toBe(false);
    expect(events.filter((e) => e.type === 'ended')).toHaveLength(1);
  });

  it('replays a finished run from the close before a day', () => {
    send({ type: 'newRun', scenarioId: 'first-steps', seed: 5 });
    send({ type: 'replayFrom', day: 2 });
    expect(last('error').message).toMatch(/Finish the run/);
    send({ type: 'placeOrder', draft: { ticker: 'SPY', side: 'buy', type: 'market', amount: { kind: 'dollars', value: 1_000 } } });
    for (let d = 0; d < 4; d++) send({ type: 'stepDay' });
    send({ type: 'end' });
    const first = last('ended').debrief;
    events.length = 0;
    send({ type: 'replayFrom', day: 2 });
    const loaded = last('loaded');
    expect(loaded.branchOf).toEqual({ day: 2, letter: first.grade.letter, score: first.grade.score });
    expect(loaded.scenario.id).toBe('first-steps');
    expect(last('tick')).toMatchObject({ day: 1, bar: 78, playing: false, finished: false });
    expect(last('account').account.equityByDay).toHaveLength(2);
    expect(last('account').account.positions.map((p) => p.ticker)).toEqual(['SPY']);
    // Nothing before the branch is re-sent as news or a day summary.
    expect(events.some((e) => e.type === 'dayEnd')).toBe(false);
    send({ type: 'end' });
    expect(last('ended').debrief.branchOf?.day).toBe(2);
  });

  it('starts a custom run from its options', () => {
    send({ type: 'newRun', scenarioId: 'custom', seed: 3, custom: { start: '2012-03-01', days: 63, startRegime: 'bull', news: 'off' } });
    const loaded = last('loaded');
    expect(loaded.scenario.id).toBe('custom');
    expect(loaded.dates).toHaveLength(63);
    expect(loaded.dates[0]).toBe('2012-03-01');
    expect(last('news').items).toHaveLength(1);
  });

  it('reports errors instead of throwing', () => {
    send({ type: 'newRun', scenarioId: 'nope', seed: 1 });
    expect(last('error').message).toMatch(/Unknown scenario/);
  });
});
