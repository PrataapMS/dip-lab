/**
 * Messages between the UI and the engine worker. Everything here must survive
 * structured cloning: plain objects, arrays and typed arrays only.
 */
import type { AccountSettings } from './account';
import type { NewsItem, Upcoming } from './news';
import type { Order, OrderDraft } from './orders';
import type { AccountView } from './run';

export type { AccountView } from './run';
export type { NewsItem, Upcoming } from './news';

export type Command =
  | { type: 'newRun'; scenarioId: string; seed: number; settings?: AccountSettings }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'speed'; dayLengthMs: number }
  | { type: 'stepDay' }
  | { type: 'placeOrder'; draft: OrderDraft }
  | { type: 'cancelOrder'; id: number }
  /** Tickers whose recent closes come with each `day` event (watchlist sparklines). */
  | { type: 'watch'; tickers: string[] }
  /** The ticker on screen: its full history now, and its intraday points with every tick. */
  | { type: 'inspect'; ticker: string | null };

export interface InstrumentInfo {
  ticker: string;
  name: string;
  sector: string | null;
  kind: 'stock' | 'etf';
  beta: number;
  /** Annualised volatility at normal market conditions. */
  vol: number;
  divYield: number;
}

export interface ScenarioInfo {
  id: string;
  name: string;
  teaches: string;
  fictional: boolean;
}

export interface Series {
  ticker: string;
  values: number[];
}

/** Closes kept for each watchlist sparkline. */
export const SPARK_DAYS = 30;

export type WorkerEvent =
  | {
      type: 'loaded';
      scenario: ScenarioInfo;
      seed: number;
      settings: AccountSettings;
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
      /** Market index closes from the start up to the previous close (day + 1 values), with dividends reinvested. */
      indexHistory: number[];
      /** Today's index price × this = its total-return level (dividends reinvested). */
      indexFactor: number;
      /** Recent closes (up to the previous close) for each watched ticker. */
      watch: Series[];
      /** Annualised market volatility today; spreads widen when it is high. */
      marketVol: number;
    }
  | {
      type: 'tick';
      day: number;
      bar: number;
      /** Current price per instrument, in `instruments` order. */
      prices: Float32Array;
      /** Market index total-return level at each bar so far today (bar + 1 values). */
      indexToday: number[];
      /** The inspected ticker's price at each bar so far today. */
      focus: Series | null;
      playing: boolean;
      finished: boolean;
      dayLengthMs: number;
    }
  | { type: 'account'; account: AccountView }
  | {
      type: 'history';
      ticker: string;
      /** Price before the first day, then each close up to the previous close (day + 1 values). */
      closes: number[];
      /** Price at each bar so far today. */
      today: number[];
      /** Its news so far, newest first. */
      news: NewsItem[];
      upcoming: Upcoming;
    }
  /** New lines for the news feed, oldest first. */
  | { type: 'news'; items: NewsItem[] }
  /** Answer to placeOrder or cancelOrder. */
  | { type: 'orderResult'; ok: boolean; order: Order | null; message: string }
  /** Orders that filled, expired or were rejected while the clock ran. */
  | { type: 'orderUpdates'; orders: Order[] }
  | { type: 'error'; message: string };
