import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { AccountSettings } from '../engine/account';
import { DEFAULT_DAY_LENGTH_MS } from '../engine/clock';
import { REFERENCE_MARKET_VOL } from '../engine/regimes';
import type { Order } from '../engine/orders';
import type { AccountView, Command, InstrumentInfo, ScenarioInfo, WorkerEvent } from '../engine/protocol';

export interface Notice {
  id: number;
  ok: boolean;
  message: string;
}

export interface History {
  ticker: string;
  closes: number[];
  today: number[];
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
  /** Market index price at each bar so far today. */
  indexToday: number[];
  /** Recent closes per watched ticker. */
  watch: Record<string, number[]>;
  /** Full history of the inspected ticker. */
  history: History | null;
  account: AccountView | null;
  /** Latest order messages, newest last. */
  notices: Notice[];
}

const EMPTY = new Float32Array(0);
const MAX_NOTICES = 4;

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
  indexToday: [],
  watch: {},
  history: null,
  account: null,
  notices: [],
};

let noticeId = 0;

function addNotices(state: MarketView, items: { ok: boolean; message: string }[]): Notice[] {
  const added = items.filter((n) => n.message).map((n) => ({ ...n, id: ++noticeId }));
  return [...state.notices, ...added].slice(-MAX_NOTICES);
}

function updateMessage(o: Order): { ok: boolean; message: string } {
  switch (o.status) {
    case 'filled':
      return { ok: true, message: `Filled: ${o.side === 'buy' ? 'bought' : 'sold'} ${o.ticker} at $${(o.fillPrice ?? 0).toFixed(2)}.` };
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
        dayLengthMs: state.dayLengthMs,
      };
    case 'day': {
      const watch: Record<string, number[]> = {};
      for (const s of e.watch) watch[s.ticker] = s.values;
      return { ...state, day: e.day, prevCloses: e.prevCloses, indexHistory: e.indexHistory, watch, marketVol: e.marketVol };
    }
    case 'tick': {
      const history =
        state.history && e.focus && e.focus.ticker === state.history.ticker ? { ...state.history, today: e.focus.values } : state.history;
      return {
        ...state,
        day: e.day,
        bar: e.bar,
        prices: e.prices,
        indexToday: e.indexToday,
        history,
        playing: e.playing,
        finished: e.finished,
        dayLengthMs: e.dayLengthMs,
      };
    }
    case 'account':
      return { ...state, account: e.account };
    case 'history':
      return { ...state, history: { ticker: e.ticker, closes: e.closes, today: e.today } };
    case 'orderResult':
      return { ...state, notices: addNotices(state, [{ ok: e.ok, message: e.message }]) };
    case 'orderUpdates':
      return { ...state, notices: addNotices(state, e.orders.map(updateMessage)) };
    case 'error':
      return { ...state, error: e.message };
  }
}

/** Starts the engine worker and exposes its live state plus the commands it accepts. */
export function useMarket() {
  const worker = useRef<Worker | null>(null);
  const [view, setView] = useState<MarketView>(initialView);

  useEffect(() => {
    const w = new Worker(new URL('../worker/market.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<WorkerEvent>) => setView((s) => reduce(s, e.data));
    worker.current = w;
    return () => {
      w.terminate();
      worker.current = null;
    };
  }, []);

  const send = useCallback((cmd: Command) => worker.current?.postMessage(cmd), []);
  const startRun = useCallback(
    (scenarioId: string, seed: number, settings?: AccountSettings) => {
      setView((s) => ({ ...s, ready: false, starting: true, error: null }));
      send({ type: 'newRun', scenarioId, seed, settings });
    },
    [send],
  );
  const dismissNotice = useCallback((id: number) => setView((s) => ({ ...s, notices: s.notices.filter((n) => n.id !== id) })), []);
  return { view, send, startRun, dismissNotice };
}

export type Market = ReturnType<typeof useMarket>;
