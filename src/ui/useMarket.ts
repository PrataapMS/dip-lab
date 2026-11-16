import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { AccountSettings } from '../engine/account';
import { DEFAULT_DAY_LENGTH_MS } from '../engine/clock';
import { REFERENCE_MARKET_VOL } from '../engine/regimes';
import type { Order } from '../engine/orders';
import type {
  AccountView,
  BranchOf,
  Command,
  CustomOptions,
  DaySummary,
  Debrief,
  EndReason,
  InstrumentInfo,
  NewsItem,
  ScenarioInfo,
  SlotHeader,
  Upcoming,
  WorkerEvent,
} from '../engine/protocol';
import { freeSlot, type SlotBody } from '../storage/slots';

export interface Notice {
  id: number;
  ok: boolean;
  message: string;
}

export interface History {
  ticker: string;
  closes: number[];
  today: number[];
  news: NewsItem[];
  upcoming: Upcoming;
}

/** Everything needed to start (or replay) a run. */
export interface RunConfig {
  scenarioId: string;
  seed: number;
  settings?: AccountSettings;
  targetReturn?: number;
  custom?: CustomOptions;
  /** Set when the run is a challenge from the Learn tab. */
  challenge?: string;
  /** Save slot; chosen automatically (or by asking) when left out. */
  slot?: number;
  /** Real time per trading day; the Settings default when left out. */
  dayLengthMs?: number;
}

export interface MarketView {
  ready: boolean;
  /** A new run was asked for and the worker is building it. */
  starting: boolean;
  error: string | null;
  scenario: ScenarioInfo | null;
  seed: number;
  settings: AccountSettings | null;
  dates: string[];
  instruments: InstrumentInfo[];
  /** Ticker → index in `instruments`. */
  tickerIndex: Map<string, number>;
  indexInstrument: number;
  day: number;
  bar: number;
  playing: boolean;
  finished: boolean;
  dayLengthMs: number;
  prices: Float32Array;
  prevCloses: Float32Array;
  /** Today's annualised market volatility (sets the spread). */
  marketVol: number;
  /** Market index closes up to yesterday. */
  indexHistory: number[];
  /** Today's SPY price × this = its level with dividends reinvested. */
  indexFactor: number;
  /** Market index price at each bar so far today. */
  indexToday: number[];
  /** Recent closes per watched ticker. */
  watch: Record<string, number[]>;
  /** Full history of the inspected ticker. */
  history: History | null;
  account: AccountView | null;
  /** Latest order messages, newest last. */
  notices: Notice[];
  /** News feed, newest last. */
  news: NewsItem[];
  endReason: EndReason | null;
  pauseAtClose: boolean;
  /** Summary of the latest close, until dismissed. */
  daySummary: DaySummary | null;
  /** End-of-run report, once the run is over. */
  debrief: Debrief | null;
  /** How the current run was started, so it can be replayed. */
  config: RunConfig | null;
  /** Set when this run replays a moment of an earlier one. */
  branchOf: BranchOf | null;
  /** Save slot of the current run, null when it isn't saved. */
  slot: number | null;
  /** What each save slot holds; null until read. */
  slots: (SlotHeader | null)[] | null;
  /** A run waiting for the player to pick a slot to replace (all are full). */
  slotPick: RunConfig | null;
}

const EMPTY = new Float32Array(0);
const MAX_NOTICES = 2;

export const initialView: MarketView = {
  ready: false,
  starting: false,
  error: null,
  scenario: null,
  seed: 0,
  settings: null,
  dates: [],
  instruments: [],
  tickerIndex: new Map(),
  indexInstrument: -1,
  day: 0,
  bar: 0,
  playing: false,
  finished: false,
  dayLengthMs: DEFAULT_DAY_LENGTH_MS,
  prices: EMPTY,
  prevCloses: EMPTY,
  marketVol: REFERENCE_MARKET_VOL,
  indexHistory: [],
  indexFactor: 1,
  indexToday: [],
  watch: {},
  history: null,
  account: null,
  notices: [],
  news: [],
  endReason: null,
  pauseAtClose: false,
  daySummary: null,
  debrief: null,
  config: null,
  branchOf: null,
  slot: null,
  slots: null,
  slotPick: null,
};

/** News lines kept for the feed. */
export const NEWS_KEPT = 60;

/** Headlines and news about holdings also pop up as notices. */
export function newsNotices(items: readonly NewsItem[]): { ok: boolean; message: string }[] {
  return items
    .filter((n) => n.kind === 'headline' || n.mine)
    .map((n) => ({ ok: n.tone !== 'down', message: n.text }));
}

let noticeId = 0;

function addNotices(state: MarketView, items: { ok: boolean; message: string }[]): Notice[] {
  const added = items.filter((n) => n.message).map((n) => ({ ...n, id: ++noticeId }));
  return [...state.notices, ...added].slice(-MAX_NOTICES);
}

function updateMessage(o: Order): { ok: boolean; message: string } {
  switch (o.status) {
    case 'filled':
      return {
        ok: true,
        message: `Filled: ${o.side === 'buy' ? (o.short ? 'covered' : 'bought') : o.short ? 'sold short' : 'sold'} ${o.ticker} at $${(o.fillPrice ?? 0).toFixed(2)}.`,
      };
    case 'expired':
      return { ok: false, message: `Your ${o.type} order on ${o.ticker} expired at the close.` };
    case 'rejected':
      return { ok: false, message: o.reason ?? `Your order on ${o.ticker} was rejected.` };
    default:
      return { ok: true, message: '' };
  }
}

export function reduce(state: MarketView, e: WorkerEvent): MarketView {
  switch (e.type) {
    case 'loaded':
      return {
        ...initialView,
        ready: true,
        scenario: e.scenario,
        seed: e.seed,
        settings: e.settings,
        dates: e.dates,
        instruments: e.instruments,
        tickerIndex: new Map(e.instruments.map((inst, i) => [inst.ticker, i])),
        indexInstrument: e.indexInstrument,
        branchOf: e.branchOf,
        notices: e.branchOf
          ? addNotices(initialView, [
              {
                ok: true,
                message: `Replaying from the close before day ${e.branchOf.day + 1}: your account is as it was then. Press play when ready.`,
              },
            ])
          : [],
        dayLengthMs: state.dayLengthMs,
        config: e.config,
        slot: e.slot,
        slots: state.slots,
      };
    case 'day': {
      const watch: Record<string, number[]> = {};
      for (const s of e.watch) watch[s.ticker] = s.values;
      return {
        ...state,
        day: e.day,
        prevCloses: e.prevCloses,
        indexHistory: e.indexHistory,
        indexFactor: e.indexFactor,
        watch,
        marketVol: e.marketVol,
      };
    }
    case 'tick': {
      const history =
        state.history && e.focus && e.focus.ticker === state.history.ticker
          ? { ...state.history, today: e.focus.values }
          : state.history;
      return {
        ...state,
        day: e.day,
        bar: e.bar,
        prices: e.prices,
        indexToday: e.indexToday,
        history,
        playing: e.playing,
        finished: e.finished,
        endReason: e.endReason,
        pauseAtClose: e.pauseAtClose,
        dayLengthMs: e.dayLengthMs,
      };
    }
    case 'account':
      return { ...state, account: e.account };
    case 'history':
      return {
        ...state,
        history: {
          ticker: e.ticker,
          closes: e.closes,
          today: e.today,
          news: e.news,
          upcoming: e.upcoming,
        },
      };
    case 'news':
      return {
        ...state,
        news: [...state.news, ...e.items].slice(-NEWS_KEPT),
        notices: e.earlier ? state.notices : addNotices(state, newsNotices(e.items)),
      };
    case 'orderResult':
      return { ...state, notices: addNotices(state, [{ ok: e.ok, message: e.message }]) };
    case 'activity':
      return state;
    case 'alerts':
      return {
        ...state,
        notices: addNotices(
          state,
          e.alerts.map((a) => ({ ok: a.ok, message: a.message })),
        ),
      };
    case 'orderUpdates':
      return { ...state, notices: addNotices(state, e.orders.map(updateMessage)) };
    case 'dayEnd':
      return { ...state, daySummary: e.summary };
    case 'ended':
      return { ...state, endReason: e.reason, debrief: e.debrief, finished: true, playing: false };
    case 'slots':
      if (e.headers.some(Boolean)) askToPersist();
      return { ...state, slots: e.headers };
    case 'flushed':
    case 'exported':
    case 'imported':
      return state;
    case 'error':
      return { ...state, error: e.message, starting: false };
  }
}

let persistAsked = false;

/** Once there is a save, ask the browser to keep the app's data under storage pressure. */
function askToPersist(): void {
  if (persistAsked || typeof navigator === 'undefined') return;
  persistAsked = true;
  void navigator.storage?.persist?.().catch(() => false);
}

/** Starts the engine worker and exposes its live state plus the commands it accepts. */
export function useMarket() {
  const worker = useRef<Worker | null>(null);
  const [view, setView] = useState<MarketView>(initialView);
  const listeners = useRef(new Set<(e: WorkerEvent) => void>());

  useEffect(() => {
    const w = new Worker(new URL('../worker/market.worker.ts', import.meta.url), {
      type: 'module',
    });
    w.onmessage = (e: MessageEvent<WorkerEvent>) => {
      setView((s) => reduce(s, e.data));
      for (const fn of listeners.current) fn(e.data);
    };
    worker.current = w;
    w.postMessage({ type: 'listSlots' } satisfies Command);
    // Save when the page is hidden: on phones that may be the last chance before it is killed.
    const flush = () => {
      if (document.visibilityState === 'hidden') w.postMessage({ type: 'flush' } satisfies Command);
    };
    document.addEventListener('visibilitychange', flush);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', flush);
      window.removeEventListener('pagehide', flush);
      w.terminate();
      worker.current = null;
    };
  }, []);
  const viewRef = useRef(view);
  viewRef.current = view;

  const send = useCallback((cmd: Command) => worker.current?.postMessage(cmd), []);
  const startRun = useCallback(
    (config: RunConfig) => {
      const slots = viewRef.current.slots;
      const slot = config.slot ?? (slots ? freeSlot(slots) : undefined);
      if (slot === null) {
        // Every slot is taken: ask which run to replace.
        setView((s) => ({ ...s, slotPick: config }));
        return;
      }
      setView((s) => ({ ...s, ready: false, starting: true, error: null, slotPick: null }));
      send({ type: 'newRun', ...config, ...(slot !== undefined ? { slot } : {}) });
    },
    [send],
  );
  const cancelSlotPick = useCallback(() => setView((s) => ({ ...s, slotPick: null })), []);
  const loadSlot = useCallback(
    (slot: number) => {
      setView((s) => ({ ...s, ready: false, starting: true, error: null }));
      send({ type: 'loadSlot', slot });
    },
    [send],
  );
  const deleteSlot = useCallback((slot: number) => send({ type: 'deleteSlot', slot }), [send]);
  /** Send a command and wait for the event that answers it (or an error). */
  const ask = useCallback(
    <T extends WorkerEvent['type']>(cmd: Command, answer: T, timeoutMs = 30_000) =>
      new Promise<Extract<WorkerEvent, { type: T }>>((resolve, reject) => {
        const w = worker.current;
        if (!w) return reject(new Error('The engine is not running.'));
        const stop = () => {
          clearTimeout(timer);
          listeners.current.delete(onEvent);
        };
        const onEvent = (e: WorkerEvent) => {
          if (e.type === answer) {
            stop();
            resolve(e as Extract<WorkerEvent, { type: T }>);
          } else if (e.type === 'error') {
            stop();
            reject(new Error(e.message));
          }
        };
        const timer = setTimeout(() => {
          stop();
          reject(new Error('The engine took too long to answer.'));
        }, timeoutMs);
        listeners.current.add(onEvent);
        w.postMessage(cmd);
      }),
    [],
  );
  const exportSlots = useCallback(
    async (slots: number[]) => (await ask({ type: 'exportSlots', slots }, 'exported')).runs,
    [ask],
  );
  const importRun = useCallback(
    async (slot: number, run: SlotBody) => {
      await ask({ type: 'importRun', slot, run }, 'imported');
    },
    [ask],
  );
  /** Pause and save now; resolves once written (or after a second at most). */
  const saveNow = useCallback(
    () =>
      new Promise<void>((resolve) => {
        const w = worker.current;
        if (!w) return resolve();
        const done = () => {
          clearTimeout(timer);
          listeners.current.delete(onEvent);
          resolve();
        };
        const onEvent = (e: WorkerEvent) => {
          if (e.type === 'flushed') done();
        };
        const timer = setTimeout(done, 1000);
        listeners.current.add(onEvent);
        if (viewRef.current.playing) w.postMessage({ type: 'pause' } satisfies Command);
        w.postMessage({ type: 'flush' } satisfies Command);
      }),
    [],
  );
  const replayFrom = useCallback(
    (day: number) => {
      setView((s) => ({ ...s, ready: false, starting: true, error: null }));
      send({ type: 'replayFrom', day });
    },
    [send],
  );
  const dismissSummary = useCallback(() => setView((s) => ({ ...s, daySummary: null })), []);
  const dismissNotice = useCallback(
    (id: number) => setView((s) => ({ ...s, notices: s.notices.filter((n) => n.id !== id) })),
    [],
  );
  /** Hear every worker event (after it is applied to the view). Returns an unsubscribe. */
  const subscribe = useCallback((fn: (e: WorkerEvent) => void) => {
    listeners.current.add(fn);
    return () => {
      listeners.current.delete(fn);
    };
  }, []);
  /** Show a message in the notice stack. */
  const notify = useCallback(
    (ok: boolean, message: string) =>
      setView((s) => ({ ...s, notices: addNotices(s, [{ ok, message }]) })),
    [],
  );
  return {
    view,
    send,
    startRun,
    cancelSlotPick,
    loadSlot,
    deleteSlot,
    saveNow,
    exportSlots,
    importRun,
    replayFrom,
    dismissNotice,
    dismissSummary,
    subscribe,
    notify,
  };
}

export type Market = ReturnType<typeof useMarket>;
