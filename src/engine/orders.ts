import { type AccountState, type Amount, executeTrade, type MarketTime, type PriceOf, type Side, usd } from './account';
import { fillPrice } from './costs';
import { BARS_PER_DAY } from './intraday';

/**
 * Orders and how they fill against 5-minute bars.
 *
 * - Market: fills at once at the current price plus or minus half the spread. Placed after
 *   the close, it waits and fills at the next open (so overnight gaps hit it).
 * - Limit: a buy fills once the ask touches the limit, at the limit or better; a sell
 *   once the bid touches it. A limit never fills at a worse price than it names.
 * - Stop (stop-loss): a sell triggers once the price trades at or below the stop and fills
 *   at the stop or, when the price gapped through it, at the gap price, less the spread.
 *   A buy stop is the mirror image.
 * - Day orders expire at the close; good-till-cancelled orders wait until they fill.
 */
export type OrderType = 'market' | 'limit' | 'stop';
export type TimeInForce = 'day' | 'gtc';
export type OrderStatus = 'open' | 'filled' | 'cancelled' | 'rejected' | 'expired';

export interface OrderDraft {
  ticker: string;
  side: Side;
  type: OrderType;
  amount: Amount;
  limitPrice?: number;
  stopPrice?: number;
  tif?: TimeInForce;
}

export interface Order extends OrderDraft {
  id: number;
  tif: TimeInForce;
  status: OrderStatus;
  placedAt: MarketTime;
  /** Plain-English reason for a rejection. */
  reason?: string;
  filledAt?: MarketTime;
  fillPrice?: number;
  filledShares?: number;
}

/**
 * Prices an instrument traded through over one step of the clock. For a 5-minute bar that
 * is its open and its high and low; for the overnight step it is just the next open.
 */
export interface SegmentQuote {
  open: number;
  high: number;
  low: number;
  /** Half the bid-ask spread as a fraction of price. */
  half: number;
}

export type QuoteFn = (ticker: string) => SegmentQuote | undefined;

/** The trading day an order is live for: after the close it waits for the next session. */
export function sessionOf(placedAt: MarketTime): number {
  return placedAt.bar >= BARS_PER_DAY ? placedAt.day + 1 : placedAt.day;
}

/** Where an order would fill in this segment, or null if it is not triggered. */
export function triggerPrice(order: OrderDraft, q: SegmentQuote): { price: number; mid: number } | null {
  const { open, high, low, half } = q;
  switch (order.type) {
    case 'market':
      return { price: fillPrice(open, order.side, half), mid: open };
    case 'limit': {
      const limit = order.limitPrice ?? 0;
      if (order.side === 'buy') {
        if (fillPrice(low, 'buy', half) > limit) return null;
        const price = Math.min(limit, fillPrice(open, 'buy', half));
        return { price, mid: price / (1 + half) };
      }
      if (fillPrice(high, 'sell', half) < limit) return null;
      const price = Math.max(limit, fillPrice(open, 'sell', half));
      return { price, mid: price / (1 - half) };
    }
    case 'stop': {
      const stop = order.stopPrice ?? 0;
      if (order.side === 'sell') {
        if (low > stop) return null;
        const mid = Math.min(stop, open);
        return { price: fillPrice(mid, 'sell', half), mid };
      }
      if (high < stop) return null;
      const mid = Math.max(stop, open);
      return { price: fillPrice(mid, 'buy', half), mid };
    }
  }
}

function validate(state: AccountState, draft: OrderDraft): string | null {
  if (!(draft.amount.value > 0) || !Number.isFinite(draft.amount.value)) return 'Enter an amount above zero.';
  if (draft.type === 'limit' && !(draft.limitPrice && draft.limitPrice > 0)) return 'Set a limit price above zero.';
  if (draft.type === 'stop' && !(draft.stopPrice && draft.stopPrice > 0)) return 'Set a stop price above zero.';
  if (draft.side === 'sell' && !(state.positions[draft.ticker]?.shares ?? 0)) return `You don't own any ${draft.ticker}.`;
  return null;
}

function replaceOrder(state: AccountState, order: Order): AccountState {
  return { ...state, orders: state.orders.map((o) => (o.id === order.id ? order : o)) };
}

/** Try to fill one open order in a segment. Returns the state unchanged if it does not trigger. */
function tryFill(state: AccountState, order: Order, q: SegmentQuote, at: MarketTime, prices?: PriceOf): { state: AccountState; order: Order } {
  const hit = triggerPrice(order, q);
  if (!hit) return { state, order };
  const r = executeTrade(state, {
    ticker: order.ticker,
    side: order.side,
    amount: order.amount,
    mid: hit.mid,
    halfSpread: q.half,
    price: hit.price,
    at,
    orderId: order.id,
    prices,
  });
  if (!r.ok) {
    const rejected: Order = { ...order, status: 'rejected', reason: r.reason };
    return { state: replaceOrder(state, rejected), order: rejected };
  }
  const filled: Order = {
    ...order,
    status: 'filled',
    filledAt: at,
    fillPrice: r.fill.price,
    filledShares: r.fill.shares,
  };
  return { state: replaceOrder(r.state, filled), order: filled };
}

export interface PlaceContext {
  at: MarketTime;
  /** Current price and spread for the order's ticker, if it trades in this scenario. */
  quote: { mid: number; half: number } | undefined;
  /** Current prices of other holdings (for the margin check). */
  prices?: PriceOf;
}

/**
 * Place an order. During the session it is checked against the current price at once
 * (a market order fills; a limit or stop already crossed fills too). After the close it waits.
 */
export function placeOrder(state: AccountState, draft: OrderDraft, ctx: PlaceContext): { state: AccountState; order: Order } {
  const order: Order = {
    ...draft,
    id: state.nextOrderId,
    tif: draft.tif ?? 'day',
    status: 'open',
    placedAt: ctx.at,
  };
  const reason = ctx.quote ? validate(state, draft) : `${draft.ticker} doesn't trade in this market.`;
  if (reason) {
    const rejected: Order = { ...order, status: 'rejected', reason };
    return { state: { ...state, orders: [...state.orders, rejected], nextOrderId: order.id + 1 }, order: rejected };
  }
  const placed: AccountState = { ...state, orders: [...state.orders, order], nextOrderId: order.id + 1 };
  if (!ctx.quote || ctx.at.bar >= BARS_PER_DAY) return { state: placed, order };
  const { mid, half } = ctx.quote;
  return tryFill(placed, order, { open: mid, high: mid, low: mid, half }, ctx.at, ctx.prices);
}

/**
 * Run every open order against one step of the clock, oldest first. `at` is the clock
 * position the step ends at, used to stamp fills. Returns the orders that changed.
 */
export function processOrders(state: AccountState, quote: QuoteFn, at: MarketTime): { state: AccountState; changed: Order[] } {
  const changed: Order[] = [];
  let s = state;
  const prices: PriceOf = (t) => quote(t)?.open;
  for (const order of state.orders) {
    if (order.status !== 'open') continue;
    // An order placed after the close waits for its own session.
    if (sessionOf(order.placedAt) > at.day) continue;
    const q = quote(order.ticker);
    if (!q) continue;
    const r = tryFill(s, order, q, at, prices);
    if (r.order !== order) {
      s = r.state;
      changed.push(r.order);
    }
  }
  return { state: s, changed };
}

/** At the close of `day`, day orders for that session expire. */
export function expireDayOrders(state: AccountState, day: number): { state: AccountState; changed: Order[] } {
  const changed: Order[] = [];
  const orders = state.orders.map((o) => {
    if (o.status !== 'open' || o.tif !== 'day' || sessionOf(o.placedAt) > day) return o;
    const expired: Order = { ...o, status: 'expired' };
    changed.push(expired);
    return expired;
  });
  return changed.length ? { state: { ...state, orders }, changed } : { state, changed };
}

export function cancelOrder(state: AccountState, id: number): { state: AccountState; order?: Order; reason?: string } {
  const order = state.orders.find((o) => o.id === id);
  if (!order) return { state, reason: 'That order no longer exists.' };
  if (order.status !== 'open') return { state, order, reason: `That order is already ${order.status}.` };
  const cancelled: Order = { ...order, status: 'cancelled' };
  return { state: replaceOrder(state, cancelled), order: cancelled };
}

/** "$1,000" for whole dollars, "$812.40" otherwise. */
function money(value: number): string {
  return Number.isInteger(value) ? usd(value).replace(/\.00$/, '') : usd(value);
}

/** One line saying exactly what an order does, e.g. "Buy $1,000 of NVDA". */
export function describeOrder(d: OrderDraft): string {
  const amount =
    d.amount.kind === 'dollars'
      ? `${money(d.amount.value)} of ${d.ticker}`
      : `${Number(d.amount.value.toFixed(4))} ${d.amount.value === 1 ? 'share' : 'shares'} of ${d.ticker}`;
  const verb = d.side === 'buy' ? 'Buy' : 'Sell';
  switch (d.type) {
    case 'market':
      return `${verb} ${amount}`;
    case 'limit':
      return `${verb} ${amount} at ${usd(d.limitPrice ?? 0)} or ${d.side === 'buy' ? 'less' : 'more'}`;
    case 'stop':
      return d.side === 'sell'
        ? `Set a stop-loss on ${d.ticker} at ${usd(d.stopPrice ?? 0)}`
        : `${verb} ${amount} if it rises to ${usd(d.stopPrice ?? 0)}`;
  }
}

function sharesWord(shares: number): string {
  const n = Number(shares.toFixed(4));
  return `${n} ${n === 1 ? 'share' : 'shares'}`;
}

/** Plain-English status line for an order, e.g. "Bought 1.2 shares of NVDA at $812.40." */
export function orderMessage(o: Order): string {
  switch (o.status) {
    case 'filled':
      return `${o.side === 'buy' ? 'Bought' : 'Sold'} ${sharesWord(o.filledShares ?? 0)} of ${o.ticker} at ${usd(o.fillPrice ?? 0)}.`;
    case 'open':
      return o.type === 'market' ? `Market closed. ${describeOrder(o)} at the next open.` : `Order placed: ${describeOrder(o)}.`;
    case 'cancelled':
      return `Cancelled: ${describeOrder(o)}.`;
    case 'expired':
      return `Expired at the close: ${describeOrder(o)}.`;
    case 'rejected':
      return o.reason ?? 'Order rejected.';
  }
}
