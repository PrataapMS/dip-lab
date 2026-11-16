import {
  type AccountMarks,
  type AccountSettings,
  type AccountState,
  buyingPower,
  chargeBorrowFees,
  chargeInterest,
  createAccount,
  type MarginCall,
  type DividendPayment,
  DEFAULT_ACCOUNT_SETTINGS,
  type Fill,
  type MarketTime,
  markToMarket,
  payDividends,
  type PositionMark,
  recordClose,
  type SectorSlice,
} from './account';
import {
  type ClockState,
  createClock,
  DEFAULT_DAY_LENGTH_MS,
  isFinished,
  pendingSteps,
  setDayLength,
  setPlaying,
  stepClock,
  stepDay,
} from './clock';
import { halfSpread } from './costs';
import { checkMargin, forceSale, marginRatio } from './margin';
import { BARS_PER_DAY, POINTS_PER_DAY } from './intraday';
import { type Dividend, reinvestFactors } from './dividends';
import { type BuiltMarket, type DayBars, dayBars } from './market';
import { cancelOrder, expireDayOrders, type Order, type OrderDraft, placeOrder, processOrders, type SegmentQuote } from './orders';
import { REFERENCE_MARKET_VOL } from './regimes';

/** What the UI needs to draw the account; plain data, safe to post from the worker. */
export interface AccountView {
  settings: AccountSettings;
  cash: number;
  value: number;
  holdingsValue: number;
  unrealised: number;
  realised: number;
  feesPaid: number;
  spreadPaid: number;
  dividendsReceived: number;
  /** Newest first. */
  recentDividends: DividendPayment[];
  /** Account value at the previous close (starting cash on the first day). */
  prevCloseValue: number;
  positions: PositionMark[];
  sectorMix: SectorSlice[];
  openOrders: Order[];
  /** Newest first. */
  recentFills: Fill[];
  equityByDay: number[];
  interestPaid: number;
  borrowFeesPaid: number;
  /** Dividends paid out on shares sold short. */
  dividendsPaid: number;
  /** Dollars of new holdings the account can take on now (cash without margin). */
  buyingPower: number;
  /** Cash owed to the broker (0 without margin). */
  borrowed: number;
  /** Equity as a share of holdings; null when nothing is held. */
  marginRatio: number | null;
  marginCall: MarginCall | null;
}

/** Something the player must hear about now (shown as a notice). */
export interface RunAlert {
  kind: 'marginCall' | 'marginMet' | 'forcedSale';
  day: number;
  ok: boolean;
  message: string;
}

const RECENT_FILLS = 20;

/** Why a run ended: its last day, the player pressed End, the account went bust, or hit its target. */
export type EndReason = 'lastDay' | 'ended' | 'bust' | 'target';

/** The run ends at a close when the account is worth this share of its start or less. */
export const BUST_LINE = 0.1;

/** Scenarios up to this many trading days pause at each close by default. */
export const SHORT_RUN_DAYS = 70;

export interface RunOptions {
  /** Stop the clock at every close so the day summary can be read. */
  pauseAtClose?: boolean;
  /** End the run at a close once the account is up this much (e.g. 0.2 for +20%). */
  targetReturn?: number;
}

/** How a close ends the run, if it does. */
export function endAtClose(value: number, startingCash: number, targetReturn?: number): EndReason | null {
  if (value <= startingCash * BUST_LINE) return 'bust';
  if (targetReturn !== undefined && targetReturn > 0 && value >= startingCash * (1 + targetReturn)) return 'target';
  return null;
}

/**
 * One play-through: a built market, the clock and the player's account. Every step of the
 * clock (each 5-minute bar, and the overnight move to the next open) runs the open orders
 * against that step's prices, so nothing is skipped however fast the game plays.
 * Same market, same commands at the same clock positions: same result.
 */
export class Run {
  readonly market: BuiltMarket;
  readonly indexInstrument: number;
  clock: ClockState;
  account: AccountState;
  pauseAtClose: boolean;
  readonly targetReturn?: number;
  endReason: EndReason | null = null;
  /** Every alert so far, oldest first. */
  readonly alerts: RunAlert[] = [];
  private bars: DayBars;
  private barsDay: number;
  private readonly tickerIndex: Map<string, number>;
  /** Dividends by day. */
  private readonly dividendsByDay: Map<number, Dividend[]>;
  /** SPY with dividends reinvested is worth price × indexFactor[day]. */
  readonly indexFactor: Float64Array;

  constructor(
    market: BuiltMarket,
    settings: AccountSettings = DEFAULT_ACCOUNT_SETTINGS,
    dayLengthMs = DEFAULT_DAY_LENGTH_MS,
    options: RunOptions = {},
  ) {
    this.market = market;
    this.pauseAtClose = options.pauseAtClose ?? market.dates.length <= SHORT_RUN_DAYS;
    this.targetReturn = options.targetReturn;
    this.tickerIndex = new Map(market.instruments.map((inst, i) => [inst.ticker, i]));
    this.indexInstrument = this.tickerIndex.get('SPY') ?? -1;
    this.dividendsByDay = new Map();
    for (const d of market.dividends) {
      const list = this.dividendsByDay.get(d.day) ?? [];
      list.push(d);
      this.dividendsByDay.set(d.day, list);
    }
    this.indexFactor = reinvestFactors(market.dividends, this.indexInstrument, market.closes[this.indexInstrument] ?? [], market.dates.length);
    this.clock = createClock(market.dates.length, dayLengthMs);
    this.account = createAccount(settings);
    this.bars = dayBars(market, 0);
    this.barsDay = 0;
  }

  get at(): MarketTime {
    return { day: this.clock.day, bar: this.clock.bar };
  }

  /** True once the run is over, for whatever reason. */
  get finished(): boolean {
    return this.endReason !== null || isFinished(this.clock);
  }

  /**
   * End the run now: stop the clock and cancel open orders. Holdings stay, valued at the
   * current price. Returns the orders cancelled.
   */
  end(reason: EndReason = 'ended'): Order[] {
    if (this.endReason) return [];
    const cancelled: Order[] = [];
    for (const o of this.account.orders) {
      if (o.status !== 'open') continue;
      const r = cancelOrder(this.account, o.id);
      this.account = r.state;
      if (r.order) cancelled.push(r.order);
    }
    this.endReason = reason;
    this.clock = { ...this.clock, playing: false, carry: 0 };
    return cancelled;
  }

  indexOf(ticker: string): number | undefined {
    return this.tickerIndex.get(ticker);
  }

  /** Today's bars for every instrument (rebuilt when the day changes). */
  todayBars(): DayBars {
    if (this.barsDay !== this.clock.day) {
      this.bars = dayBars(this.market, this.clock.day);
      this.barsDay = this.clock.day;
    }
    return this.bars;
  }

  /** SPY's total-return level (dividends reinvested) at closes index k: 0 = before day 0. */
  indexClose(k: number): number {
    const price = this.market.closes[this.indexInstrument]?.[k] ?? 0;
    return k === 0 ? price : price * (this.indexFactor[k - 1] ?? 1);
  }

  /** Dividends going ex on a day. */
  dividendsOn(day: number): readonly Dividend[] {
    return this.dividendsByDay.get(day) ?? [];
  }

  /** Current price of instrument i. */
  mid(i: number): number {
    return this.todayBars().points[i * POINTS_PER_DAY + this.clock.bar] ?? 0;
  }

  /** Today's points for instrument i, from the open to now. */
  today(i: number): number[] {
    const start = i * POINTS_PER_DAY;
    return Array.from(this.todayBars().points.subarray(start, start + this.clock.bar + 1));
  }

  halfSpreadOf(i: number, day = this.clock.day): number {
    const inst = this.market.instruments[i];
    if (!inst) return 0;
    const marketVol = this.market.factors.vols[day] ?? REFERENCE_MARKET_VOL;
    return halfSpread(inst, marketVol, this.account.settings);
  }

  /** Current mid price of a ticker, if it trades here. */
  readonly priceOf = (ticker: string): number | undefined => {
    const i = this.tickerIndex.get(ticker);
    return i === undefined ? undefined : this.mid(i);
  };

  marks(): AccountMarks {
    return markToMarket(this.account, (ticker) => {
      const i = this.tickerIndex.get(ticker);
      if (i === undefined) return undefined;
      return { price: this.mid(i), sector: this.market.instruments[i]?.sector ?? null };
    });
  }

  view(): AccountView {
    const a = this.account;
    const m = this.marks();
    const day = this.clock.day;
    return {
      settings: a.settings,
      cash: m.cash,
      value: m.value,
      holdingsValue: m.holdingsValue,
      unrealised: m.unrealised,
      realised: a.realised,
      feesPaid: a.feesPaid,
      spreadPaid: a.spreadPaid,
      dividendsReceived: a.dividendsReceived,
      recentDividends: a.dividends.slice(-RECENT_FILLS).reverse(),
      prevCloseValue: day > 0 ? (a.equityByDay[day - 1] ?? a.settings.startingCash) : a.settings.startingCash,
      positions: m.positions,
      sectorMix: m.sectorMix,
      openOrders: a.orders.filter((o) => o.status === 'open'),
      recentFills: a.fills.slice(-RECENT_FILLS).reverse(),
      equityByDay: [...a.equityByDay],
      interestPaid: a.interestPaid,
      borrowFeesPaid: a.borrowFeesPaid,
      dividendsPaid: a.dividendsPaid,
      buyingPower: buyingPower(a, this.priceOf),
      borrowed: Math.max(0, -m.cash),
      marginRatio: m.positions.length ? Math.min(99, marginRatio(a, this.priceOf)) : null,
      marginCall: a.marginCall,
    };
  }

  place(draft: OrderDraft): Order {
    if (this.endReason) throw new Error('This run is over. Start a new one to keep trading.');
    const i = this.tickerIndex.get(draft.ticker);
    const quote = i === undefined ? undefined : { mid: this.mid(i), half: this.halfSpreadOf(i) };
    const r = placeOrder(this.account, draft, { at: this.at, quote, prices: this.priceOf });
    this.account = r.state;
    return r.order;
  }

  cancel(id: number): { order?: Order; reason?: string } {
    const r = cancelOrder(this.account, id);
    this.account = r.state;
    return { order: r.order, reason: r.reason };
  }

  play(playing: boolean): void {
    this.clock = setPlaying(this.clock, playing && !this.endReason);
  }

  setDayLength(ms: number): void {
    this.clock = setDayLength(this.clock, ms);
  }

  /** Move the clock one step and run orders against it. Returns orders whose status changed. */
  step(): Order[] {
    if (this.finished) {
      this.clock = { ...this.clock, playing: false };
      return [];
    }
    const from = this.at;
    this.clock = stepClock(this.clock);
    const at = this.at;
    let quote: (ticker: string) => SegmentQuote | undefined;
    if (from.bar < BARS_PER_DAY) {
      // A 5-minute bar of the same day completed.
      const { points, high, low } = this.todayBars();
      const k = from.bar;
      quote = (ticker) => {
        const i = this.tickerIndex.get(ticker);
        if (i === undefined) return undefined;
        return {
          open: points[i * POINTS_PER_DAY + k] ?? 0,
          high: high[i * BARS_PER_DAY + k] ?? 0,
          low: low[i * BARS_PER_DAY + k] ?? 0,
          half: this.halfSpreadOf(i),
        };
      };
    } else {
      // Overnight: holders at the close get any dividends, then the next day opens, possibly with a gap.
      this.account = payDividends(this.account, this.dividendsOn(at.day), at);
      const { points } = this.todayBars();
      if (this.account.forcedSaleDue) this.forcedSale(at);
      quote = (ticker) => {
        const i = this.tickerIndex.get(ticker);
        if (i === undefined) return undefined;
        const open = points[i * POINTS_PER_DAY] ?? 0;
        return { open, high: open, low: open, half: this.halfSpreadOf(i) };
      };
    }
    const r = this.account.orders.some((o) => o.status === 'open')
      ? processOrders(this.account, quote, at)
      : { state: this.account, changed: [] };
    this.account = r.state;
    const changed = [...r.changed];
    if (at.bar === BARS_PER_DAY) {
      const e = expireDayOrders(this.account, at.day);
      changed.push(...e.changed);
      this.account = chargeBorrowFees(chargeInterest(e.state), this.priceOf);
      const value = this.marks().value;
      this.account = recordClose(this.account, value);
      const reason = endAtClose(value, this.account.settings.startingCash, this.targetReturn);
      const called = reason ? false : this.checkMargin(at.day);
      if (reason) changed.push(...this.end(reason));
      else if (isFinished(this.clock)) this.endReason = 'lastDay';
      else if (this.pauseAtClose || called) this.clock = { ...this.clock, playing: false, carry: 0 };
    }
    if (this.finished) this.clock = { ...this.clock, playing: false, carry: 0 };
    return changed;
  }

  /** Margin check at a close. Returns true when a new call was made (the clock pauses). */
  private checkMargin(day: number): boolean {
    const r = checkMargin(this.account, this.priceOf, day);
    this.account = r.state;
    const pct = (x: number) => `${Math.round(x * 100)}%`;
    switch (r.event?.kind) {
      case 'call':
        this.alerts.push({
          kind: 'marginCall',
          day,
          ok: false,
          message: `Margin call: your equity is ${pct(r.event.ratio)} of what you hold, under the 30% minimum. Sell by the next close, or your broker sells for you at the open after.`,
        });
        return true;
      case 'met':
        this.alerts.push({ kind: 'marginMet', day, ok: true, message: 'Margin call met: your equity is back above 30% of what you hold.' });
        return false;
      default:
        return false;
    }
  }

  /** The broker sells at this open because a margin call went unmet. */
  private forcedSale(at: MarketTime): void {
    const { points } = this.todayBars();
    const r = forceSale(
      this.account,
      (ticker) => {
        const i = this.tickerIndex.get(ticker);
        if (i === undefined) return undefined;
        return { mid: points[i * POINTS_PER_DAY] ?? 0, half: this.halfSpreadOf(i, at.day) };
      },
      at,
    );
    this.account = r.state;
    if (r.fills.length) {
      const sold = r.fills.reduce((sum, f) => sum + f.shares * f.price, 0);
      const names = [...new Set(r.fills.map((f) => f.ticker))].join(', ');
      this.alerts.push({
        kind: 'forcedSale',
        day: at.day,
        ok: false,
        message: `Forced sale: the margin call wasn't met, so your broker sold $${Math.round(sold).toLocaleString('en-US')} of ${names} at the open.`,
      });
    }
  }

  /** Play forward by real elapsed time, walking every due step. */
  advance(elapsedMs: number): Order[] {
    const { steps, carry } = pendingSteps(this.clock, elapsedMs);
    const changed: Order[] = [];
    for (let s = 0; s < steps && this.clock.playing && !this.finished; s++) changed.push(...this.step());
    if (!this.finished && this.clock.playing) this.clock = { ...this.clock, carry };
    return changed;
  }

  /** Walk to today's close, or to the next day's close if already there. */
  stepDay(): Order[] {
    const target = stepDay(this.clock);
    const changed: Order[] = [];
    while (!this.finished && (this.clock.day !== target.day || this.clock.bar !== target.bar)) changed.push(...this.step());
    this.clock = { ...this.clock, carry: 0 };
    return changed;
  }
}
