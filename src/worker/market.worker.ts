/// <reference lib="webworker" />
import { UNIVERSE } from '../data/universe';
import { DEFAULT_DAY_LENGTH_MS } from '../engine/clock';
import { type Activity, closeActivity, fillActivity, orderActivity } from '../engine/activity';
import { debrief } from '../engine/debrief';
import { BARS_PER_DAY } from '../engine/intraday';
import { buildMarket } from '../engine/market';
import { dividendItem, selectNews, tickerNews, upcomingFor } from '../engine/news';
import { nextEvent, nextEventLabel, SKIP_MAX_DAYS } from '../engine/nextEvent';
import { type Order, orderMessage } from '../engine/orders';
import { type Command, type Series, SPARK_DAYS, type WorkerEvent } from '../engine/protocol';
import { REFERENCE_MARKET_VOL } from '../engine/regimes';
import { Run } from '../engine/run';
import { customScenario, getScenario } from '../engine/scenarios';
import type { ScenarioInfo } from '../engine/protocol';
import {
  dropUnlisted,
  encodeSnapshots,
  type RunSource,
  restoreRun,
  SaveError,
  saveRun,
} from '../engine/save';
import { daySummary } from '../engine/summary';
import { deleteSlot, readHeaders, readSlot, writeSlot } from '../storage/saves';
import {
  CHUNK,
  chunksToWrite,
  createSaver,
  SLOTS,
  type SlotBody,
  type SlotConfig,
  type SlotHeader,
} from '../storage/slots';
import { version } from '../../package.json';

/**
 * Runs the market off the main thread. Owns the real-time loop: it measures elapsed time,
 * hands it to the run (which walks every bar and fills orders), and posts what changed.
 */
const scope = self as unknown as DedicatedWorkerGlobalScope;

const TICK_MS = 40;
/** Cap catch-up after the tab was asleep, so the market never leaps ahead unseen. */
const MAX_ELAPSED_MS = 1000;

let run: Run | null = null;
/** Day length for new runs (Settings). */
let dayLengthMs = DEFAULT_DAY_LENGTH_MS;
/** Pause at each close for new runs: null leaves it to the run's length. */
let pauseDefault: boolean | null = null;
let postedDay = -1;
let watched: string[] = [];
/** The player's watchlist ("Next event" follows it and the holdings). */
let watchlist: string[] = [];
/** What the last `nextEvent` was worked out from, to send it only when that changes. */
let nextKey = '';
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
/** Run alerts already sent. */
let alertsSent = 0;
let scenarioInfo: ScenarioInfo | null = null;
/** Fills already reported as activity. */
let fillsSent = 0;
let lastDebrief: ReturnType<typeof debrief> | null = null;
/** The run was opened already finished from a save. */
let endRestored = false;

/** Autosave: the slot the run lives in, how it was started, and how far its closes are stored. */
let slot: number | null = null;
let config: SlotConfig = { scenarioId: '', seed: 0 };
let savedCloses = 0;
let clearChunks = false;
/** Bumped whenever another run is loaded, so a write in flight can tell it is stale. */
let generation = 0;
let lastSaveAt = 0;
let headers: (SlotHeader | null)[] = Array(SLOTS).fill(null);
/** While playing, save at least this often even without a close (slow day lengths). */
const SAVE_EVERY_MS = 15_000;

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
    indexHistory:
      r.indexInstrument < 0 ? [] : Array.from({ length: day + 1 }, (_, k) => r.indexClose(k)),
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
  const followed = new Set<string>([
    ...Object.keys(a.positions),
    ...watched,
    ...(inspected ? [inspected] : []),
  ]);
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

/** Holdings (long or short) and the watchlist. */
function followed(r: Run): Set<string> {
  const held = Object.entries(r.account.positions).filter(([, p]) => p.shares !== 0);
  return new Set([...held.map(([t]) => t), ...watchlist]);
}

/** Send where "Next event" would stop, when the clock or what is followed has changed. */
function emitNext(r: Run): void {
  const atClose = r.clock.bar === BARS_PER_DAY;
  const follow = followed(r);
  const key = `${r.clock.day}:${atClose}:${r.finished}:${[...follow].sort().join(',')}`;
  if (key === nextKey) return;
  nextKey = key;
  post({
    type: 'nextEvent',
    next: r.finished ? null : nextEvent(r.market, r.clock.day, atClose, follow),
  });
}

function signedPctText(x: number): string {
  return `${x < 0 ? '−' : '+'}${Math.abs(x * 100).toFixed(1)}%`;
}

/** Play ahead to the close before the next event and say what happened on the way. */
function skipToEvent(r: Run): void {
  stopLoop();
  r.play(false);
  const next = nextEvent(r.market, r.clock.day, r.clock.bar === BARS_PER_DAY, followed(r));
  if (!next) {
    emitTick();
    post({
      type: 'notice',
      ok: true,
      message: `Nothing scheduled in the next ${SKIP_MAX_DAYS} trading days. Use play or skip.`,
    });
    return;
  }
  const from = { day: r.clock.day, value: r.marks().value };
  const { changed, stop } = r.skipTo(next.stopDay);
  emitUpdates(changed);
  emitTick();
  autosave();
  if (stop === 'end') return;
  const days = r.clock.day - from.day;
  const moved = `${days} day${days === 1 ? '' : 's'} ahead, ${signedPctText(r.marks().value / from.value - 1)}`;
  const message =
    stop === 'fill'
      ? `Stopped early: an order filled (${moved}).`
      : stop === 'marginCall'
        ? `Stopped early: margin call (${moved}).`
        : next.kind === 'lastDay'
          ? `At the last close (${moved}).`
          : `Paused before ${nextEventLabel(next)} tomorrow (${moved}).`;
  post({ type: 'notice', ok: stop === 'close', message });
}

/** Report new fills (and anything else passed in) as activity. */
function emitActivity(r: Run, extra: Activity[] = []): void {
  const fills = r.account.fills;
  const items = fills.slice(fillsSent).map((f) => fillActivity(r, f));
  fillsSent = fills.length;
  items.push(...extra);
  if (items.length) post({ type: 'activity', items });
}

/** Closes in the last account sent, to send `equityByDay` only when it grows. */
let closesPosted = -1;

function postAccount(r: Run): void {
  const { equityByDay, ...rest } = r.view();
  const same = equityByDay.length === closesPosted;
  closesPosted = equityByDay.length;
  post({ type: 'account', account: same ? rest : { ...rest, equityByDay } });
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
      indexToday:
        r.indexInstrument < 0
          ? []
          : r.today(r.indexInstrument).map((p) => p * (r.indexFactor[r.clock.day] ?? 1)),
      focus:
        inspected && focusIndex !== undefined
          ? { ticker: inspected, values: r.today(focusIndex) }
          : null,
      playing: r.clock.playing,
      finished: r.finished,
      endReason: r.endReason,
      pauseAtClose: r.pauseAtClose,
      dayLengthMs: r.clock.dayLengthMs,
    },
    [prices.buffer],
  );
  emitNews(r);
  const newAlerts = r.alerts.slice(alertsSent);
  if (newAlerts.length) post({ type: 'alerts', alerts: newAlerts });
  alertsSent = r.alerts.length;
  const extra: Activity[] = newAlerts
    .filter((x) => x.kind === 'marginCall')
    .map((x) => ({ kind: 'marginCall', day: x.day }));
  postAccount(r);
  const closes = r.account.equityByDay.length;
  if (closes > closesSent && r.clock.bar === BARS_PER_DAY) {
    post({ type: 'dayEnd', summary: daySummary(r) });
    extra.push(closeActivity(r));
  }
  emitActivity(r, extra);
  emitNext(r);
  const closed = closes > closesSent;
  closesSent = closes;
  if (r.endReason && !endSent) {
    endSent = true;
    lastDebrief = debrief(r);
    post({ type: 'ended', reason: r.endReason, debrief: lastDebrief, restored: endRestored });
    if (!endRestored) autosave();
  }
  if (closed) autosave();
}

function sourceOf(c: SlotConfig): RunSource {
  return { scenarioId: c.scenarioId, seed: c.seed, ...(c.custom ? { custom: c.custom } : {}) };
}

function headerOf(r: Run, s: number): SlotHeader {
  const start = r.indexClose(0);
  const spyNow =
    r.indexInstrument < 0 ? start : r.mid(r.indexInstrument) * (r.indexFactor[r.clock.day] ?? 1);
  return {
    slot: s,
    config,
    scenarioName: r.market.scenario.name,
    day: r.clock.day,
    totalDays: r.market.dates.length,
    value: r.marks().value,
    startingCash: r.account.settings.startingCash,
    spyReturn: start > 0 ? spyNow / start - 1 : 0,
    finished: r.finished,
    letter: r.finished && lastDebrief ? lastDebrief.grade.letter : null,
    branchDay: r.branchOf?.day ?? null,
    savedAt: new Date().toISOString(),
    app: version,
  };
}

/** Write the current run to its slot: header, run without closes, and closes not yet stored. */
async function writeCurrent(): Promise<void> {
  const r = run;
  const s = slot;
  if (!r || s === null) return;
  const g = generation;
  const clear = clearChunks;
  const n = r.snapshots.length;
  const chunks = chunksToWrite(clear ? 0 : savedCloses, n).map((index) => ({
    index,
    snapshots: encodeSnapshots(r.snapshots, index * CHUNK, Math.min(n, (index + 1) * CHUNK)),
  }));
  const header = headerOf(r, s);
  clearChunks = false;
  savedCloses = n;
  lastSaveAt = performance.now();
  const ok = await writeSlot(header, saveRun(r, sourceOf(config), false), chunks, clear);
  if (g !== generation) return;
  if (!ok) {
    // Try everything again next time.
    clearChunks = true;
    savedCloses = 0;
    return;
  }
  headers[s] = header;
  post({ type: 'slots', headers: [...headers] });
}

const saver = createSaver(writeCurrent);

function autosave(): void {
  if (run && slot !== null) saver.request();
}

/** Start saving a freshly built or branched run into a slot (or not at all). */
function useSlot(s: number | null | undefined, c: SlotConfig): void {
  generation++;
  slot = s ?? null;
  config = c;
  savedCloses = 0;
  clearChunks = true;
}

function emitUpdates(changed: Order[]): void {
  if (changed.length) post({ type: 'orderUpdates', orders: changed });
}

function loop(): void {
  try {
    loopOnce();
  } catch (err) {
    // A half-finished step can leave the run inconsistent: stop without saving it.
    stopLoop();
    generation++;
    slot = null;
    post({
      type: 'crash',
      message: err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err),
    });
  }
}

function loopOnce(): void {
  if (!run) {
    stopLoop();
    return;
  }
  const now = performance.now();
  const elapsed = Math.min(now - lastNow, MAX_ELAPSED_MS);
  lastNow = now;
  const before = run.clock;
  const changed = run.advance(elapsed);
  const after = run.clock;
  emitUpdates(changed);
  if (after.day !== before.day || after.bar !== before.bar || after.playing !== before.playing)
    emitTick();
  if (after.playing && now - lastSaveAt > SAVE_EVERY_MS) autosave();
  if (!after.playing) {
    stopLoop();
    autosave();
  }
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

/** Point the feeds at a run that was just built or branched, and tell the UI. */
function load(r: Run, seed: number, restored = false): void {
  run = r;
  postedDay = -1;
  // A branch starts part-way: news, dividends and closes before it count as already sent.
  newsCursor = 0;
  const events = r.market.events;
  while (newsCursor < events.length) {
    const e = events[newsCursor];
    if (!e || e.day > r.clock.day || (e.day === r.clock.day && e.bar > r.clock.bar)) break;
    newsCursor++;
  }
  if (r.clock.day === 0 && r.clock.bar === 0) newsCursor = 0;
  dividendsSent = r.account.dividends.length;
  closesSent = r.account.equityByDay.length;
  fillsSent = r.account.fills.length;
  endSent = false;
  closesPosted = -1;
  nextKey = '';
  endRestored = restored && r.endReason !== null;
  alertsSent = r.alerts.length;
  lastDebrief = null;
  const market = r.market;
  post({
    type: 'loaded',
    scenario: scenarioInfo ?? {
      id: market.scenario.id,
      name: market.scenario.name,
      teaches: market.scenario.teaches,
      fictional: market.scenario.fictional,
    },
    seed,
    settings: r.account.settings,
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
    indexInstrument: r.indexInstrument,
    branchOf: r.branchOf,
    slot,
    config,
    restored,
  });
  emitTick();
  if (restored) emitRecentNews(r);
}

/** News lines shown again when a saved run is opened. */
const NEWS_ON_OPEN = 12;

function emitRecentNews(r: Run): void {
  const a = r.account;
  const items = selectNews(
    r.market.events.slice(Math.max(0, newsCursor - 300), newsCursor),
    (t) => watched.includes(t) || t in a.positions,
    (t) => (a.positions[t]?.shares ?? 0) > 0,
  ).slice(-NEWS_ON_OPEN);
  if (items.length) post({ type: 'news', items, earlier: true });
}

function buildFor(c: SlotConfig) {
  const def =
    c.scenarioId === 'custom' && c.custom ? customScenario(c.custom) : getScenario(c.scenarioId);
  scenarioInfo = { id: def.id, name: def.name, teaches: def.teaches, fictional: def.fictional };
  return buildMarket(def, c.seed, UNIVERSE);
}

async function openSlot(s: number): Promise<void> {
  const body = await readSlot(s);
  if (!body) throw new Error('That save slot is empty.');
  const market = buildFor(body.header.config);
  const { save, dropped } = dropUnlisted(body.save, market);
  const r = restoreRun(market, save);
  stopLoop();
  generation++;
  slot = s;
  config = body.header.config;
  savedCloses = body.save.snapshots.length;
  clearChunks = false;
  load(r, r.market.seed, true);
  if (dropped.length) post({ type: 'notice', ok: false, message: unlistedMessage(dropped) });
}

/** Why positions in a corrected listing were closed when a save was opened. */
function unlistedMessage(tickers: string[]): string {
  return `${tickers.join(', ')} wasn't listed yet in this market, so it was closed at what you paid.`;
}

async function removeSlot(s: number): Promise<void> {
  if (slot === s) {
    await saver.idle();
    generation++;
    slot = null;
  }
  await deleteSlot(s);
  headers[s] = null;
  post({ type: 'slots', headers: [...headers] });
}

async function exportSlots(list: number[]): Promise<void> {
  autosave();
  await saver.idle();
  const runs: SlotBody[] = [];
  for (const s of list) {
    const b = await readSlot(s);
    if (b) runs.push(b);
  }
  post({ type: 'exported', runs });
}

/** Check a run from a file against its rebuilt market, then store it in a slot. */
async function importRun(s: number, body: SlotBody): Promise<void> {
  if (!Number.isInteger(s) || s < 0 || s >= SLOTS) throw new Error('No such save slot.');
  let dropped: string[] = [];
  try {
    const market = buildFor(body.header.config);
    const fixed = dropUnlisted(body.save, market);
    restoreRun(market, fixed.save);
    dropped = fixed.dropped;
    body = { ...body, save: fixed.save };
  } catch (err) {
    if (err instanceof SaveError) throw err;
    throw new Error("This run is damaged and can't be opened.");
  }
  if (slot === s) {
    // The run open now is being replaced: stop saving it over the import.
    await saver.idle();
    generation++;
    slot = null;
  }
  const header: SlotHeader = { ...body.header, slot: s };
  const snaps = body.save.snapshots;
  const chunks = chunksToWrite(0, snaps.length).map((index) => ({
    index,
    snapshots: snaps.slice(index * CHUNK, (index + 1) * CHUNK),
  }));
  if (!(await writeSlot(header, body.save, chunks, true)))
    throw new Error("Couldn't store the run on this device (storage is off or full).");
  headers[s] = header;
  post({ type: 'slots', headers: [...headers] });
  if (dropped.length) post({ type: 'notice', ok: false, message: unlistedMessage(dropped) });
  post({ type: 'imported', slot: s });
}

/** Commands that touch storage: answered when it replies; errors go to the UI. */
function handleAsync(cmd: Command): boolean {
  let job: Promise<void>;
  switch (cmd.type) {
    case 'listSlots':
      job = readHeaders().then((h) => {
        headers = h;
        post({ type: 'slots', headers: [...headers] });
      });
      break;
    case 'loadSlot':
      job = openSlot(cmd.slot);
      break;
    case 'deleteSlot':
      job = removeSlot(cmd.slot);
      break;
    case 'exportSlots':
      job = exportSlots(cmd.slots);
      break;
    case 'importRun':
      job = importRun(cmd.slot, cmd.run);
      break;
    default:
      return false;
  }
  job.catch((err: unknown) =>
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) }),
  );
  return true;
}

function handle(cmd: Command): void {
  switch (cmd.type) {
    case 'newRun': {
      stopLoop();
      const { type: _type, slot: s, dayLengthMs: ms, ...c } = cmd;
      const market = buildFor(c);
      useSlot(s, c);
      load(
        new Run(market, cmd.settings, ms ?? dayLengthMs, {
          targetReturn: cmd.targetReturn,
          ...(pauseDefault !== null ? { pauseAtClose: pauseDefault } : {}),
        }),
        cmd.seed,
      );
      autosave();
      return;
    }
    case 'defaults':
      dayLengthMs = cmd.dayLengthMs;
      pauseDefault = cmd.pauseAtClose;
      return;
    case 'flush':
      autosave();
      void saver.idle().then(() => post({ type: 'flushed' }));
      return;
    case 'detach':
      stopLoop();
      run?.play(false);
      generation++;
      slot = null;
      if (run) emitTick();
      return;
    case 'replayFrom': {
      const r = requireRun();
      if (!r.finished || !lastDebrief) throw new Error('Finish the run before replaying a moment.');
      stopLoop();
      const g = lastDebrief.grade;
      // A branch of a branch still compares with the very first try.
      const first = r.branchOf ?? { letter: g.letter, score: g.score };
      useSlot(slot, config);
      load(r.branch(cmd.day, { letter: first.letter, score: first.score }), r.market.seed);
      autosave();
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
      autosave();
      return;
    case 'speed':
      run?.setDayLength(cmd.dayLengthMs);
      if (run) emitTick();
      autosave();
      return;
    case 'stepDay':
      emitUpdates(requireRun().stepDay());
      emitTick();
      return;
    case 'skipToEvent':
      skipToEvent(requireRun());
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
      autosave();
      return;
    case 'placeOrder': {
      if (requireRun().endReason) {
        post({
          type: 'orderResult',
          ok: false,
          order: null,
          message: 'This run is over. Start a new one to keep trading.',
        });
        return;
      }
      const r = requireRun();
      const held = r.account.positions[cmd.draft.ticker]?.shares ?? 0;
      const order = r.place(cmd.draft);
      post({
        type: 'orderResult',
        ok: order.status !== 'rejected',
        order,
        message: orderMessage(order),
      });
      emitActivity(r, order.status === 'rejected' ? [] : [orderActivity(order, held)]);
      postAccount(requireRun());
      autosave();
      return;
    }
    case 'cancelOrder': {
      const r = requireRun().cancel(cmd.id);
      const ok = !r.reason;
      post({
        type: 'orderResult',
        ok,
        order: r.order ?? null,
        message: r.reason ?? (r.order ? orderMessage(r.order) : ''),
      });
      postAccount(requireRun());
      autosave();
      return;
    }
    case 'watchlist':
      watchlist = cmd.tickers;
      if (run) emitNext(run);
      return;
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
    if (!handleAsync(e.data)) handle(e.data);
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
