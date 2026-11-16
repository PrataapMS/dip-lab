import { type CostModel, fillPrice } from './costs';
import type { Order } from './orders';

/**
 * The player's account: cash, holdings at average cost, and every fill. Pure functions that
 * return a new state, so a run replays exactly from its seed and the player's orders.
 * No margin and no shorting yet: buys are limited by cash, sells by shares held.
 */
export interface AccountSettings extends CostModel {
  startingCash: number;
}

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
  /** Account value at each close so far. */
  equityByDay: number[];
  /** Every order placed, oldest first, whatever its status. */
  orders: Order[];
  nextOrderId: number;
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
    equityByDay: [],
    orders: [],
    nextOrderId: 1,
  };
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
    if (cost > state.cash + 1e-9) {
      return { ok: false, reason: `Not enough cash: this needs ${usd(cost)} and you have ${usd(state.cash)}.` };
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

/** Record the account value at a day's close. */
export function recordClose(state: AccountState, value: number): AccountState {
  return { ...state, equityByDay: [...state.equityByDay, value] };
}
