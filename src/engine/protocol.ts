/**
 * Messages between the UI and the engine worker. Everything here must survive
 * structured cloning: plain objects, arrays and typed arrays only.
 */
import type { AccountSettings } from './account';
import type { Activity } from './activity';
import type { Debrief } from './debrief';
import type { NewsItem, Upcoming } from './news';
import type { Order, OrderDraft } from './orders';
import type { CustomOptions } from './scenarios';
import type { AccountView, BranchOf, EndReason, RunAlert } from './run';
import type { DaySummary } from './summary';
import type { SlotConfig, SlotHeader } from '../storage/slots';

export type { AccountView } from './run';
export type { Activity, HoldingFact } from './activity';
export type { NewsItem, Upcoming } from './news';
export type { BranchOf, EndReason, RunAlert } from './run';
export type { CustomOptions } from './scenarios';
export type { DaySummary } from './summary';
export type { Debrief, Moment, TradeStat } from './debrief';
export type { SlotConfig, SlotHeader } from '../storage/slots';

export type Command =
  | {
      type: 'newRun';
      scenarioId: string;
      seed: number;
      settings?: AccountSettings;
      /** End at a close once the account is up this much. */
      targetReturn?: number;
      /** Required when scenarioId is 'custom'. */
      custom?: CustomOptions;
      /** Set when the run is a challenge from the Learn tab. */
      challenge?: string;
      /** Save slot the run autosaves into; without one it lives in memory only. */
      slot?: number;
    }
  /** Read the save slots (answered with `slots`). */
  | { type: 'listSlots' }
  /** Open the run saved in a slot, paused where it was. */
  | { type: 'loadSlot'; slot: number }
  | { type: 'deleteSlot'; slot: number }
  /** Save the current run now (the page is being hidden or closed); answered with `flushed`. */
  | { type: 'flush' }
  /** Another tab took over: pause and stop saving, so this tab never overwrites its saves. */
  | { type: 'detach' }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'speed'; dayLengthMs: number }
  | { type: 'stepDay' }
  /** Finish the run now and go to the debrief. */
  | { type: 'end' }
  | { type: 'pauseAtClose'; on: boolean }
  /** After a run ends: go back to the close before `day` of the same market and play on from there. */
  | { type: 'replayFrom'; day: number }
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

/** Debrief moments tied to one day, so they can be replayed from the close before it. */
export const REPLAYABLE_MOMENTS: readonly string[] = [
  'soldNearLow',
  'stopSlippage',
  'marginCall',
  'forcedSale',
  'shortSqueeze',
];

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
      /** Set when this run replays a moment of an earlier one. */
      branchOf: BranchOf | null;
      /** Save slot, null when the run isn't saved. */
      slot: number | null;
      /** How the run was started, to replay it. */
      config: SlotConfig;
      /** Opened from a save rather than started or branched now. */
      restored: boolean;
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
      endReason: EndReason | null;
      pauseAtClose: boolean;
      dayLengthMs: number;
    }
  /** Sent at each close. */
  | { type: 'dayEnd'; summary: DaySummary }
  /** The run is over: why, and the end-of-run report. */
  | {
      type: 'ended';
      reason: EndReason;
      debrief: Debrief;
      /** The run was already over when it was opened from a save: nothing new to reward. */
      restored: boolean;
    }
  /** What each save slot holds (null for empty), after it changes. */
  | { type: 'slots'; headers: (SlotHeader | null)[] }
  /** Everything asked for so far is written. */
  | { type: 'flushed' }
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
  | {
      type: 'news';
      items: NewsItem[];
      /** Earlier lines, resent when a saved run is opened: no pop-up notices. */
      earlier?: boolean;
    }
  /** Answer to placeOrder or cancelOrder. */
  | { type: 'orderResult'; ok: boolean; order: Order | null; message: string }
  /** What the player did, for quests, streaks and badges. */
  | { type: 'activity'; items: Activity[] }
  /** Margin calls and forced sales, oldest first. */
  | { type: 'alerts'; alerts: RunAlert[] }
  /** Orders that filled, expired or were rejected while the clock ran. */
  | { type: 'orderUpdates'; orders: Order[] }
  | { type: 'error'; message: string };
