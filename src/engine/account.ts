import { type CostModel, fillPrice } from './costs';
import type { Order } from './orders';

/**
 * The player's account: cash, holdings at average cost, and every fill. Pure functions that
 * return a new state, so a run replays exactly from its seed and the player's orders.
 * Without margin, buys are limited by cash. With margin, cash can go below zero (a loan) as
 * long as equity stays at least `INITIAL_MARGIN` of everything held.
 */
export interface AccountSettings extends CostModel {
  startingCash: number;
  /** Borrow up to 2x (Reg T 50% initial margin). Off by default. */
  margin?: boolean;
  /** Yearly interest on borrowed cash. Default `DEFAULT_MARGIN_RATE`. */
  marginRate?: number;
}

/** Equity must be at least this share of holdings after a buy on margin (so 2x at most). */
export const INITIAL_MARGIN = 0.5;
/** Below this share at a close the broker issues a margin call. */
export const MAINTENANCE_MARGIN = 0.3;
/** A forced sale sells until equity is back to this share of holdings. */
export const FORCED_SALE_TARGET = 0.4;
export const DEFAULT_MARGIN_RATE = 0.08;
const DAYS_PER_YEAR = 252;

export const DEFAULT_ACCOUNT_SETTINGS: AccountSettings = {
  startingCash: 10_000,
  commission: 0,
  spreadOn: true,
};

/** A point in market time: bar 0 is the open, bar 78 the close. */
export interface MarketTime {
  day: number;
  bar: number;
}

export interface Position {
  shares: number;
  /** Total paid for the shares still held, spread and commission included. */
  costBasis: number;
}

export type Side = 'buy' | 'sell';

export interface Amount {
  kind: 'dollars' | 'shares';
  value: number;
}

export interface Fill {
  orderId: number | null;
  ticker: string;
  side: Side;
  shares: number;
  /** Price per share actually paid or received, spread included. */
  price: number;
  /** Mid price at the moment of the fill. */
  mid: number;
  commission: number;
  /** Profit or loss locked in by a sell (0 for buys), net of costs. */
  realised: number;
  at: MarketTime;
  /** Sold by the broker after a margin call went unmet. */
  forced?: boolean;
}

/** A margin call: equity fell below `MAINTENANCE_MARGIN` of holdings at a close. */
export interface MarginCall {
  day: number;
  /** Equity as a share of holdings when the call was made. */
  ratio: number;
}

/** Cash paid on shares held at the close before an ex-dividend date. */
export interface DividendPayment {
  ticker: string;
  shares: number;
  perShare: number;
  amount: number;
  at: MarketTime;
}

export interface AccountState {
  settings: AccountSettings;
  cash: number;
  positions: Record<string, Position>;
  realised: number;
  /** Commissions paid. */
  feesPaid: number;
  /** Cost of crossing the bid-ask spread, summed over all fills. */
  spreadPaid: number;
  fills: Fill[];
  dividends: DividendPayment[];
  dividendsReceived: number;
  /** Account value at each close so far. */
  equityByDay: number[];
  /** Every order placed, oldest first, whatever its status. */
  orders: Order[];
  nextOrderId: number;
  /** Interest charged on borrowed cash. */
  interestPaid: number;
  /** The call that is open now, if any. */
  marginCall: MarginCall | null;
  /** Every call made, oldest first. */
  marginCalls: MarginCall[];
  /** The call went unmet: the broker sells at the next open. */
  forcedSaleDue: boolean;
}

/** Fractional shares are kept to six decimal places. */
const SHARE_STEP = 1e-6;

export function roundShares(shares: number): number {
  return Math.round(shares / SHARE_STEP) * SHARE_STEP;
}

function floorShares(shares: number): number {
  // The epsilon stops 0.3 / 0.1 style float noise from losing a whole step.
  return Math.floor(shares / SHARE_STEP + 1e-6) * SHARE_STEP;
}

export function usd(value: number): string {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function sharesText(shares: number): string {
  const s = Number(shares.toFixed(6)).toString();
  return `${s} ${shares === 1 ? 'share' : 'shares'}`;
}

export function createAccount(settings: AccountSettings = DEFAULT_ACCOUNT_SETTINGS): AccountState {
  if (!(settings.startingCash > 0)) throw new Error('Starting cash must be above zero');
  if (!(settings.commission >= 0)) throw new Error('Commission cannot be negative');
  return {
    settings,
    cash: settings.startingCash,
    positions: {},
    realised: 0,
    feesPaid: 0,
    spreadPaid: 0,
    fills: [],
    dividends: [],
    dividendsReceived: 0,
    equityByDay: [],
    orders: [],
    nextOrderId: 1,
    interestPaid: 0,
    marginCall: null,
    marginCalls: [],
    forcedSaleDue: false,
  };
}

/** Price per share used to value a holding: the quote if there is one, else its average cost. */
export type PriceOf = (ticker: string) => number | undefined;

export interface Exposure {
  /** Cash plus holdings at current prices. */
  equity: number;
  /** Market value of everything held, ignoring sign. */
  gross: number;
}

export function exposure(cash: number, positions: Record<string, Position>, priceOf?: PriceOf): Exposure {
  let net = 0;
  let gross = 0;
  for (const [ticker, pos] of Object.entries(positions)) {
    const avg = pos.shares !== 0 ? pos.costBasis / pos.shares : 0;
    const value = pos.shares * (priceOf?.(ticker) ?? avg);
    net += value;
    gross += Math.abs(value);
  }
  return { equity: cash + net, gross };
}

/** Dollars of new holdings the account can take on right now. */
export function buyingPower(state: AccountState, priceOf?: PriceOf): number {
  if (!state.settings.margin) return Math.max(0, state.cash);
  const { equity, gross } = exposure(state.cash, state.positions, priceOf);
  return Math.max(0, (equity - INITIAL_MARGIN * gross) / INITIAL_MARGIN);
}

export interface TradeRequest {
  ticker: string;
  side: Side;
  amount: Amount;
  /** Mid price right now. */
  mid: number;
  /** Half the bid-ask spread as a fraction of price (see `halfSpread`). */
  halfSpread: number;
  /** Execution price when an order sets it (limits, stops); otherwise mid plus or minus half the spread. */
  price?: number;
  at: MarketTime;
  orderId?: number | null;
  /** Prices of other holdings, for the margin check. */
  prices?: PriceOf;
  /** A broker's forced sale (skips the buying-power check). */
  forced?: boolean;
}

export type TradeResult = { ok: true; state: AccountState; fill: Fill } | { ok: false; reason: string };

/** Fill a trade against the account at the given price, or explain in plain words why not. */
export function executeTrade(state: AccountState, req: TradeRequest): TradeResult {
  const { ticker, side, amount } = req;
  if (!(amount.value > 0) || !Number.isFinite(amount.value)) return { ok: false, reason: 'Enter an amount above zero.' };
  if (!(req.mid > 0)) return { ok: false, reason: `${ticker} has no price right now.` };
  const price = req.price ?? fillPrice(req.mid, side, req.halfSpread);
  const commission = state.settings.commission;
  const held = state.positions[ticker];

  let shares: number;
  if (side === 'buy') {
    shares = amount.kind === 'dollars' ? floorShares(amount.value / price) : roundShares(amount.value);
    if (shares <= 0) return { ok: false, reason: `That buys less than a millionth of a share of ${ticker}.` };
    const cost = shares * price + commission;
    if (!state.settings.margin) {
      if (cost > state.cash + 1e-9) {
        return { ok: false, reason: `Not enough cash: this needs ${usd(cost)} and you have ${usd(state.cash)}.` };
      }
    } else if (!req.forced) {
      const priceOf: PriceOf = (t) => (t === ticker ? req.mid : req.prices?.(t));
      const after = { ...state.positions, [ticker]: { shares: (held?.shares ?? 0) + shares, costBasis: (held?.costBasis ?? 0) + cost } };
      const e = exposure(state.cash - cost, after, priceOf);
      if (e.equity < INITIAL_MARGIN * e.gross - 1e-9) {
        const power = buyingPower(state, priceOf);
        return { ok: false, reason: `Not enough buying power: this needs ${usd(cost)} and you can spend up to ${usd(power)}, borrowing included.` };
      }
    }
  } else {
    if (!held || held.shares <= 0) return { ok: false, reason: `You don't own any ${ticker}.` };
    shares = roundShares(amount.kind === 'dollars' ? amount.value / price : amount.value);
    if (shares > held.shares + SHARE_STEP) {
      return { ok: false, reason: `You own ${sharesText(held.shares)} of ${ticker}, so you can't sell ${sharesText(shares)}.` };
    }
    // Rounding can leave a hair more than is held; sell exactly what is there.
    shares = Math.min(shares, held.shares);
    if (shares <= 0) return { ok: false, reason: `That sells less than a millionth of a share of ${ticker}.` };
    if (shares * price < commission) {
      return { ok: false, reason: `This sale is worth less than the ${usd(commission)} commission.` };
    }
  }

  const positions = { ...state.positions };
  let cash = state.cash;
  let realised = 0;
  if (side === 'buy') {
    const paid = shares * price + commission;
    cash -= paid;
    positions[ticker] = {
      shares: roundShares((held?.shares ?? 0) + shares),
      costBasis: (held?.costBasis ?? 0) + paid,
    };
  } else if (held) {
    const proceeds = shares * price - commission;
    const basisSold = held.shares > 0 ? (held.costBasis * shares) / held.shares : 0;
    cash += proceeds;
    realised = proceeds - basisSold;
    const left = roundShares(held.shares - shares);
    if (left <= 0) delete positions[ticker];
    else positions[ticker] = { shares: left, costBasis: held.costBasis - basisSold };
  }

  const fill: Fill = {
    orderId: req.orderId ?? null,
    ticker,
    side,
    shares,
    price,
    mid: req.mid,
    commission,
    realised,
    at: req.at,
    ...(req.forced ? { forced: true } : {}),
  };
  return {
    ok: true,
    fill,
    state: {
      ...state,
      cash,
      positions,
      realised: state.realised + realised,
      feesPaid: state.feesPaid + commission,
      spreadPaid: state.spreadPaid + Math.abs(price - req.mid) * shares,
      fills: [...state.fills, fill],
    },
  };
}

export interface Quote {
  price: number;
  sector: string | null;
}

export interface PositionMark {
  ticker: string;
  shares: number;
  avgCost: number;
  price: number;
  value: number;
  /** Signed dollars and fraction of cost. */
  unrealised: number;
  unrealisedPct: number;
}

export interface SectorSlice {
  sector: string;
  value: number;
  /** Share of the account's holdings (cash excluded). */
  share: number;
}

export interface AccountMarks {
  cash: number;
  holdingsValue: number;
  value: number;
  unrealised: number;
  positions: PositionMark[];
  sectorMix: SectorSlice[];
}

/** Label used in the sector mix for funds that hold the whole market. */
export const BROAD_MARKET = 'Broad market';

/** Value everything at current mid prices. Positions are sorted by value, largest first. */
export function markToMarket(state: AccountState, quote: (ticker: string) => Quote | undefined): AccountMarks {
  const positions: PositionMark[] = [];
  const bySector = new Map<string, number>();
  let holdingsValue = 0;
  let unrealised = 0;
  for (const [ticker, pos] of Object.entries(state.positions)) {
    const avgCost = pos.shares > 0 ? pos.costBasis / pos.shares : 0;
    const q = quote(ticker);
    const price = q?.price ?? avgCost;
    const value = pos.shares * price;
    const u = value - pos.costBasis;
    positions.push({
      ticker,
      shares: pos.shares,
      avgCost,
      price,
      value,
      unrealised: u,
      unrealisedPct: pos.costBasis > 0 ? u / pos.costBasis : 0,
    });
    holdingsValue += value;
    unrealised += u;
    const sector = q?.sector ?? BROAD_MARKET;
    bySector.set(sector, (bySector.get(sector) ?? 0) + value);
  }
  positions.sort((a, b) => b.value - a.value || a.ticker.localeCompare(b.ticker));
  const sectorMix = [...bySector.entries()]
    .map(([sector, value]) => ({ sector, value, share: holdingsValue > 0 ? value / holdingsValue : 0 }))
    .sort((a, b) => b.value - a.value || a.sector.localeCompare(b.sector));
  return { cash: state.cash, holdingsValue, value: state.cash + holdingsValue, unrealised, positions, sectorMix };
}

/** Pay dividends on shares held now (call at the ex-date open, before any trading). */
export function payDividends(state: AccountState, due: readonly { ticker: string; perShare: number }[], at: MarketTime): AccountState {
  const paid: DividendPayment[] = [];
  for (const d of due) {
    const shares = state.positions[d.ticker]?.shares ?? 0;
    if (shares > 0 && d.perShare > 0) paid.push({ ticker: d.ticker, shares, perShare: d.perShare, amount: shares * d.perShare, at });
  }
  if (paid.length === 0) return state;
  const total = paid.reduce((s, p) => s + p.amount, 0);
  return {
    ...state,
    cash: state.cash + total,
    dividends: [...state.dividends, ...paid],
    dividendsReceived: state.dividendsReceived + total,
  };
}

/** Record the account value at a day's close. */
export function recordClose(state: AccountState, value: number): AccountState {
  return { ...state, equityByDay: [...state.equityByDay, value] };
}

/** Interest for one trading day on borrowed cash (negative cash), taken from cash. */
export function chargeInterest(state: AccountState): AccountState {
  if (state.cash >= 0) return state;
  const rate = state.settings.marginRate ?? DEFAULT_MARGIN_RATE;
  const amount = (-state.cash * rate) / DAYS_PER_YEAR;
  if (!(amount > 0)) return state;
  return { ...state, cash: state.cash - amount, interestPaid: state.interestPaid + amount };
}
