/// <reference lib="webworker" />
import { UNIVERSE } from '../data/universe';
import {
  advanceClock,
  type ClockState,
  createClock,
  DAY_LENGTHS,
  DEFAULT_DAY_LENGTH,
  isFinished,
  setDayLength,
  setPlaying,
  stepDay,
} from '../engine/clock';
import { POINTS_PER_DAY } from '../engine/intraday';
import { type BuiltMarket, buildMarket, dayPrices } from '../engine/market';
import type { Command, WorkerEvent } from '../engine/protocol';
import { getScenario } from '../engine/scenarios';

/**
 * Runs the market off the main thread. Owns the real-time loop: it measures elapsed time,
 * feeds it to the pure clock, and posts prices whenever the market moves.
 */
const scope = self as unknown as DedicatedWorkerGlobalScope;

const TICK_MS = 40;
/** Cap catch-up after the tab was asleep, so the market never leaps ahead unseen. */
const MAX_ELAPSED_MS = 1000;

let market: BuiltMarket | null = null;
let clock: ClockState = createClock(1);
let dayLengthMs: number = DAY_LENGTHS[DEFAULT_DAY_LENGTH];
let current: Float32Array | null = null;
let currentDay = -1;
let indexInstrument = -1;
let lastNow = 0;
let timer: ReturnType<typeof setInterval> | null = null;

function post(event: WorkerEvent, transfer: Transferable[] = []): void {
  scope.postMessage(event, transfer);
}

function loadDay(day: number): void {
  if (!market || day === currentDay) return;
  current = dayPrices(market, day);
  currentDay = day;
  const prevCloses = Float32Array.from(market.closes, (c) => c[day] ?? 0);
  const index = market.closes[indexInstrument];
  const indexHistory = index ? Array.from(index.subarray(0, day + 1)) : [];
  post({ type: 'day', day, prevCloses, indexHistory }, [prevCloses.buffer]);
}

function emitTick(): void {
  if (!market || !current) return;
  loadDay(clock.day);
  const n = market.instruments.length;
  const prices = new Float32Array(n);
  for (let i = 0; i < n; i++) prices[i] = current[i * POINTS_PER_DAY + clock.bar] ?? 0;
  const indexStart = indexInstrument * POINTS_PER_DAY;
  const indexToday = indexInstrument < 0 ? [] : Array.from(current.subarray(indexStart, indexStart + clock.bar + 1));
  post(
    {
      type: 'tick',
      day: clock.day,
      bar: clock.bar,
      prices,
      indexToday,
      playing: clock.playing,
      finished: isFinished(clock),
      dayLengthMs: clock.dayLengthMs,
    },
    [prices.buffer],
  );
}

function loop(): void {
  const now = performance.now();
  const elapsed = Math.min(now - lastNow, MAX_ELAPSED_MS);
  lastNow = now;
  const before = clock;
  clock = advanceClock(clock, elapsed);
  if (clock.day !== before.day || clock.bar !== before.bar || clock.playing !== before.playing) emitTick();
  if (!clock.playing) stopLoop();
}

function startLoop(): void {
  if (timer !== null) return;
  lastNow = performance.now();
  timer = setInterval(loop, TICK_MS);
}

function stopLoop(): void {
  if (timer === null) return;
  clearInterval(timer);
  timer = null;
}

function handle(cmd: Command): void {
  switch (cmd.type) {
    case 'load': {
      stopLoop();
      const def = getScenario(cmd.scenarioId);
      market = buildMarket(def, cmd.seed, UNIVERSE);
      indexInstrument = market.instruments.findIndex((i) => i.ticker === 'SPY');
      clock = createClock(market.dates.length, dayLengthMs);
      currentDay = -1;
      post({
        type: 'loaded',
        scenario: { id: def.id, name: def.name, teaches: def.teaches, fictional: def.fictional },
        seed: cmd.seed,
        dates: market.dates,
        instruments: market.instruments.map((i) => ({ ticker: i.ticker, name: i.name, sector: i.sector, kind: i.kind })),
        indexInstrument,
      });
      loadDay(0);
      emitTick();
      return;
    }
    case 'play':
      clock = setPlaying(clock, true);
      if (clock.playing) startLoop();
      emitTick();
      return;
    case 'pause':
      clock = setPlaying(clock, false);
      stopLoop();
      emitTick();
      return;
    case 'speed':
      dayLengthMs = cmd.dayLengthMs;
      clock = setDayLength(clock, cmd.dayLengthMs);
      emitTick();
      return;
    case 'stepDay':
      clock = stepDay(clock);
      emitTick();
      return;
  }
}

scope.onmessage = (e: MessageEvent<Command>) => {
  try {
    handle(e.data);
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
