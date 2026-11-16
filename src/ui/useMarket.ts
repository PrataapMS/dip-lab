import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { Command, InstrumentInfo, ScenarioInfo, WorkerEvent } from '../engine/protocol';

export interface MarketView {
  ready: boolean;
  error: string | null;
  scenario: ScenarioInfo | null;
  seed: number;
  dates: string[];
  instruments: InstrumentInfo[];
  indexInstrument: number;
  day: number;
  bar: number;
  playing: boolean;
  finished: boolean;
  dayLengthMs: number;
  prices: Float32Array;
  prevCloses: Float32Array;
  /** Market index closes up to yesterday. */
  indexHistory: number[];
  /** Market index price at each bar so far today. */
  indexToday: number[];
}

const EMPTY = new Float32Array(0);

const initial: MarketView = {
  ready: false,
  error: null,
  scenario: null,
  seed: 0,
  dates: [],
  instruments: [],
  indexInstrument: -1,
  day: 0,
  bar: 0,
  playing: false,
  finished: false,
  dayLengthMs: 30_000,
  prices: EMPTY,
  prevCloses: EMPTY,
  indexHistory: [],
  indexToday: [],
};

function reduce(state: MarketView, e: WorkerEvent): MarketView {
  switch (e.type) {
    case 'loaded':
      return {
        ...initial,
        ready: true,
        scenario: e.scenario,
        seed: e.seed,
        dates: e.dates,
        instruments: e.instruments,
        indexInstrument: e.indexInstrument,
        dayLengthMs: state.dayLengthMs,
      };
    case 'day':
      return { ...state, day: e.day, prevCloses: e.prevCloses, indexHistory: e.indexHistory };
    case 'tick':
      return {
        ...state,
        day: e.day,
        bar: e.bar,
        prices: e.prices,
        indexToday: e.indexToday,
        playing: e.playing,
        finished: e.finished,
        dayLengthMs: e.dayLengthMs,
      };
    case 'error':
      return { ...state, error: e.message };
  }
}

/** Starts the engine worker and exposes its live state plus the commands it accepts. */
export function useMarket(scenarioId: string, seed: number) {
  const worker = useRef<Worker | null>(null);
  const [view, setView] = useState<MarketView>(initial);

  useEffect(() => {
    const w = new Worker(new URL('../worker/market.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<WorkerEvent>) => setView((s) => reduce(s, e.data));
    worker.current = w;
    return () => {
      w.terminate();
      worker.current = null;
    };
  }, []);

  useEffect(() => {
    setView((s) => ({ ...s, ready: false }));
    worker.current?.postMessage({ type: 'load', scenarioId, seed } satisfies Command);
  }, [scenarioId, seed]);

  const send = useCallback((cmd: Command) => worker.current?.postMessage(cmd), []);
  return { view, send };
}
