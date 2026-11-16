import {
  type AccountMarks,
  type AccountSettings,
  type AccountState,
  createAccount,
  DEFAULT_ACCOUNT_SETTINGS,
  type Fill,
  type MarketTime,
  markToMarket,
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
import { BARS_PER_DAY, POINTS_PER_DAY } from './intraday';
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
  /** Account value at the previous close (starting cash on the first day). */
  prevCloseValue: number;
  positions: PositionMark[];
  sectorMix: SectorSlice[];
  openOrders: Order[];
  /** Newest first. */
  recentFills: Fill[];
  equityByDay: number[];
}

const RECENT_FILLS = 20;

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
  private bars: DayBars;
  private barsDay: number;
  private readonly tickerIndex: Map<string, number>;

  constructor(market: BuiltMarket, settings: AccountSettings = DEFAULT_ACCOUNT_SETTINGS, dayLengthMs = DEFAULT_DAY_LENGTH_MS) {
    this.market = market;
    this.tickerIndex = new Map(market.instruments.map((inst, i) => [inst.ticker, i]));
    this.indexInstrument = this.tickerIndex.get('SPY') ?? -1;
    this.clock = createClock(market.dates.length, dayLengthMs);
    this.account = createAccount(settings);
    this.bars = dayBars(market, 0);
    this.barsDay = 0;
  }

  get at(): MarketTime {
    return { day: this.clock.day, bar: this.clock.bar };
  }

  get finished(): boolean {
    return isFinished(this.clock);
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
      prevCloseValue: day > 0 ? (a.equityByDay[day - 1] ?? a.settings.startingCash) : a.settings.startingCash,
      positions: m.positions,
      sectorMix: m.sectorMix,
      openOrders: a.orders.filter((o) => o.status === 'open'),
      recentFills: a.fills.slice(-RECENT_FILLS).reverse(),
      equityByDay: [...a.equityByDay],
    };
  }

  place(draft: OrderDraft): Order {
    const i = this.tickerIndex.get(draft.ticker);
    const quote = i === undefined ? undefined : { mid: this.mid(i), half: this.halfSpreadOf(i) };
    const r = placeOrder(this.account, draft, { at: this.at, quote });
    this.account = r.state;
    return r.order;
  }

  cancel(id: number): { order?: Order; reason?: string } {
    const r = cancelOrder(this.account, id);
    this.account = r.state;
    return { order: r.order, reason: r.reason };
  }

  play(playing: boolean): void {
    this.clock = setPlaying(this.clock, playing);
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
      // Overnight: the next day opens, possibly with a gap.
      const { points } = this.todayBars();
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
      this.account = recordClose(e.state, this.marks().value);
    }
    if (this.finished) this.clock = { ...this.clock, playing: false, carry: 0 };
    return changed;
  }

  /** Play forward by real elapsed time, walking every due step. */
  advance(elapsedMs: number): Order[] {
    const { steps, carry } = pendingSteps(this.clock, elapsedMs);
    const changed: Order[] = [];
    for (let s = 0; s < steps && !this.finished; s++) changed.push(...this.step());
    if (!this.finished) this.clock = { ...this.clock, carry };
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
