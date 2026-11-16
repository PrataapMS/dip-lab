/**
 * Messages between the UI and the engine worker. Everything here must survive
 * structured cloning: plain objects, arrays and typed arrays only.
 */

export type Command =
  | { type: 'load'; scenarioId: string; seed: number }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'speed'; dayLengthMs: number }
  | { type: 'stepDay' };

export interface InstrumentInfo {
  ticker: string;
  name: string;
  sector: string | null;
  kind: 'stock' | 'etf';
}

export interface ScenarioInfo {
  id: string;
  name: string;
  teaches: string;
  fictional: boolean;
}

export type WorkerEvent =
  | {
      type: 'loaded';
      scenario: ScenarioInfo;
      seed: number;
      dates: string[];
      instruments: InstrumentInfo[];
      /** Index of the instrument used as "the market" (SPY), -1 if absent. */
      indexInstrument: number;
    }
  | {
      type: 'day';
      day: number;
      /** Previous close per instrument, in `instruments` order. */
      prevCloses: Float32Array;
      /** Market index closes from the start up to the previous close (day + 1 values). */
      indexHistory: number[];
    }
  | {
      type: 'tick';
      day: number;
      bar: number;
      /** Current price per instrument, in `instruments` order. */
      prices: Float32Array;
      /** Market index price at each bar so far today (bar + 1 values). */
      indexToday: number[];
      playing: boolean;
      finished: boolean;
      dayLengthMs: number;
    }
  | { type: 'error'; message: string };
