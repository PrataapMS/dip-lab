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
    send({ type: 'load', scenarioId: 'covid-2020', seed: 7 });
    expect(events.map((e) => e.type)).toEqual(['loaded', 'day', 'tick']);
    const loaded = last('loaded');
    expect(loaded.dates[0]).toBe('2020-02-20');
    expect(loaded.instruments[loaded.indexInstrument]?.ticker).toBe('SPY');
    const tick = last('tick');
    expect([tick.day, tick.bar, tick.playing]).toEqual([0, 0, false]);
    expect(tick.prices).toHaveLength(loaded.instruments.length);
  });

  it('ticks while playing and stops when paused', () => {
    send({ type: 'load', scenarioId: 'covid-2020', seed: 7 });
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
    send({ type: 'load', scenarioId: 'gfc-2008', seed: 3 });
    send({ type: 'stepDay' });
    const a = Array.from(last('tick').prices);
    send({ type: 'load', scenarioId: 'gfc-2008', seed: 3 });
    send({ type: 'stepDay' });
    expect(Array.from(last('tick').prices)).toEqual(a);
  });

  it('moves to the next day and sends its previous closes', () => {
    send({ type: 'load', scenarioId: 'first-steps', seed: 1 });
    send({ type: 'stepDay' });
    const close = last('tick').prices;
    send({ type: 'stepDay' });
    const day = last('day');
    expect(day.day).toBe(1);
    expect(Array.from(day.prevCloses)).toEqual(Array.from(close));
    expect(day.indexHistory).toHaveLength(2);
  });

  it('reports errors instead of throwing', () => {
    send({ type: 'load', scenarioId: 'nope', seed: 1 });
    expect(last('error').message).toMatch(/Unknown scenario/);
  });
});
