/// <reference lib="webworker" />
import { UNIVERSE } from '../data/universe';
import { DEFAULT_DAY_LENGTH_MS } from '../engine/clock';
import { BARS_PER_DAY } from '../engine/intraday';
import { buildMarket } from '../engine/market';
import { dividendItem, selectNews, tickerNews, upcomingFor } from '../engine/news';
import { type Order, orderMessage } from '../engine/orders';
import { type Command, type Series, SPARK_DAYS, type WorkerEvent } from '../engine/protocol';
import { REFERENCE_MARKET_VOL } from '../engine/regimes';
import { Run } from '../engine/run';
import { getScenario } from '../engine/scenarios';
import { daySummary } from '../engine/summary';

/**
 * Runs the market off the main thread. Owns the real-time loop: it measures elapsed time,
 * hands it to the run (which walks every bar and fills orders), and posts what changed.
 */
const scope = self as unknown as DedicatedWorkerGlobalScope;

const TICK_MS = 40;
/** Cap catch-up after the tab was asleep, so the market never leaps ahead unseen. */
const MAX_ELAPSED_MS = 1000;

let run: Run | null = null;
let dayLengthMs = DEFAULT_DAY_LENGTH_MS;
let postedDay = -1;
let watched: string[] = [];
let inspected: string | null = null;
let lastNow = 0;
let timer: ReturnType<typeof setInterval> | null = null;
/** Next market event not yet sent to the feed. */
let newsCursor = 0;
/** Dividend payments already sent to the feed. */
let dividendsSent = 0;
/** Closes already summarised. */
let closesSent = 0;
let endSent = false;

function post(event: WorkerEvent, transfer: Transferable[] = []): void {
  scope.postMessage(event, transfer);
}

function closesUpTo(r: Run, i: number, day: number, count: number): number[] {
  const closes = r.market.closes[i];
  if (!closes) return [];
  return Array.from(closes.subarray(Math.max(0, day + 1 - count), day + 1));
}

function watchSeries(r: Run, day: number): Series[] {
  const out: Series[] = [];
  for (const ticker of watched) {
    const i = r.indexOf(ticker);
    if (i !== undefined) out.push({ ticker, values: closesUpTo(r, i, day, SPARK_DAYS) });
  }
  return out;
}

function dayPayload(r: Run): Extract<WorkerEvent, { type: 'day' }> {
  const day = r.clock.day;
  return {
    type: 'day',
    day,
    prevCloses: Float32Array.from(r.market.closes, (c) => c[day] ?? 0),
    indexHistory: r.indexInstrument < 0 ? [] : Array.from({ length: day + 1 }, (_, k) => r.indexClose(k)),
    indexFactor: r.indexFactor[day] ?? 1,
    watch: watchSeries(r, day),
    marketVol: r.market.factors.vols[day] ?? REFERENCE_MARKET_VOL,
  };
}

function emitDay(r: Run): void {
  postedDay = r.clock.day;
  const event = dayPayload(r);
  post(event, [event.prevCloses.buffer]);
  emitHistory(r);
}

function emitHistory(r: Run): void {
  if (!inspected) return;
  const i = r.indexOf(inspected);
  if (i === undefined) return;
  post({
    type: 'history',
    ticker: inspected,
    closes: closesUpTo(r, i, r.clock.day, r.clock.day + 1),
    today: r.today(i),
    news: tickerNews(r.market, inspected, r.clock.day, r.clock.bar),
    upcoming: upcomingFor(r.market, inspected, r.clock.day),
  });
}

/** Send market events that have happened since the last call, plus dividends received. */
function emitNews(r: Run): void {
  const events = r.market.events;
  const start = newsCursor;
  const { day, bar } = r.clock;
  while (newsCursor < events.length) {
    const e = events[newsCursor];
    if (!e || e.day > day || (e.day === day && e.bar > bar)) break;
    newsCursor++;
  }
  const a = r.account;
  const followed = new Set<string>([...Object.keys(a.positions), ...watched, ...(inspected ? [inspected] : [])]);
  for (const o of a.orders) if (o.status === 'open') followed.add(o.ticker);
  const items = selectNews(
    events.slice(start, newsCursor),
    (t) => followed.has(t),
    (t) => (a.positions[t]?.shares ?? 0) > 0,
  );
  for (const p of a.dividends.slice(dividendsSent)) items.push(dividendItem(p));
  dividendsSent = a.dividends.length;
  if (items.length) post({ type: 'news', items });
}

function emitTick(): void {
  if (!run) return;
  const r = run;
  if (r.clock.day !== postedDay) emitDay(r);
  const n = r.market.instruments.length;
  const prices = new Float32Array(n);
  for (let i = 0; i < n; i++) prices[i] = r.mid(i);
  const focusIndex = inspected ? r.indexOf(inspected) : undefined;
  post(
    {
      type: 'tick',
      day: r.clock.day,
      bar: r.clock.bar,
      prices,
      indexToday: r.indexInstrument < 0 ? [] : r.today(r.indexInstrument).map((p) => p * (r.indexFactor[r.clock.day] ?? 1)),
      focus: inspected && focusIndex !== undefined ? { ticker: inspected, values: r.today(focusIndex) } : null,
      playing: r.clock.playing,
      finished: r.finished,
      endReason: r.endReason,
      pauseAtClose: r.pauseAtClose,
      dayLengthMs: r.clock.dayLengthMs,
    },
    [prices.buffer],
  );
  emitNews(r);
  post({ type: 'account', account: r.view() });
  const closes = r.account.equityByDay.length;
  if (closes > closesSent && r.clock.bar === BARS_PER_DAY) post({ type: 'dayEnd', summary: daySummary(r) });
  closesSent = closes;
  if (r.endReason && !endSent) {
    endSent = true;
    post({ type: 'ended', reason: r.endReason });
  }
}

function emitUpdates(changed: Order[]): void {
  if (changed.length) post({ type: 'orderUpdates', orders: changed });
}

function loop(): void {
  if (!run) return stopLoop();
  const now = performance.now();
  const elapsed = Math.min(now - lastNow, MAX_ELAPSED_MS);
  lastNow = now;
  const before = run.clock;
  const changed = run.advance(elapsed);
  const after = run.clock;
  emitUpdates(changed);
  if (after.day !== before.day || after.bar !== before.bar || after.playing !== before.playing) emitTick();
  if (!after.playing) stopLoop();
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

function requireRun(): Run {
  if (!run) throw new Error('No run loaded');
  return run;
}

function handle(cmd: Command): void {
  switch (cmd.type) {
    case 'newRun': {
      stopLoop();
      const def = getScenario(cmd.scenarioId);
      const market = buildMarket(def, cmd.seed, UNIVERSE);
      run = new Run(market, cmd.settings, dayLengthMs, { targetReturn: cmd.targetReturn });
      postedDay = -1;
      newsCursor = 0;
      dividendsSent = 0;
      closesSent = 0;
      endSent = false;
      post({
        type: 'loaded',
        scenario: { id: def.id, name: def.name, teaches: def.teaches, fictional: def.fictional },
        seed: cmd.seed,
        settings: run.account.settings,
        dates: market.dates,
        instruments: market.instruments.map((i) => ({
          ticker: i.ticker,
          name: i.name,
          sector: i.sector,
          kind: i.kind,
          beta: i.beta,
          vol: i.vol,
          divYield: i.divYield,
        })),
        indexInstrument: run.indexInstrument,
      });
      emitTick();
      return;
    }
    case 'play': {
      const r = requireRun();
      r.play(true);
      if (r.clock.playing) startLoop();
      emitTick();
      return;
    }
    case 'pause':
      requireRun().play(false);
      stopLoop();
      emitTick();
      return;
    case 'speed':
      dayLengthMs = cmd.dayLengthMs;
      run?.setDayLength(cmd.dayLengthMs);
      if (run) emitTick();
      return;
    case 'stepDay':
      emitUpdates(requireRun().stepDay());
      emitTick();
      return;
    case 'end': {
      const r = requireRun();
      stopLoop();
      emitUpdates(r.end('ended'));
      emitTick();
      return;
    }
    case 'pauseAtClose':
      requireRun().pauseAtClose = cmd.on;
      emitTick();
      return;
    case 'placeOrder': {
      if (requireRun().endReason) {
        post({ type: 'orderResult', ok: false, order: null, message: 'This run is over. Start a new one to keep trading.' });
        return;
      }
      const order = requireRun().place(cmd.draft);
      post({ type: 'orderResult', ok: order.status !== 'rejected', order, message: orderMessage(order) });
      post({ type: 'account', account: requireRun().view() });
      return;
    }
    case 'cancelOrder': {
      const r = requireRun().cancel(cmd.id);
      const ok = !r.reason;
      post({ type: 'orderResult', ok, order: r.order ?? null, message: r.reason ?? (r.order ? orderMessage(r.order) : '') });
      post({ type: 'account', account: requireRun().view() });
      return;
    }
    case 'watch':
      watched = cmd.tickers;
      if (run) emitDay(run);
      return;
    case 'inspect':
      inspected = cmd.ticker;
      if (run) emitHistory(run);
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
