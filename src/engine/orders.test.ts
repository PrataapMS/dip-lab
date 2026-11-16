import { describe, expect, it } from 'vitest';
import { type AccountState, createAccount } from './account';
import { BARS_PER_DAY } from './intraday';
import {
  cancelOrder,
  describeOrder,
  expireDayOrders,
  type Order,
  type OrderDraft,
  orderMessage,
  placeOrder,
  processOrders,
  type SegmentQuote,
} from './orders';

const HALF = 0.001;
const noSpread = createAccount({ startingCash: 10_000, commission: 0, spreadOn: false });

function place(state: AccountState, draft: OrderDraft, mid: number, bar = 10, day = 0, half = HALF) {
  return placeOrder(state, draft, { at: { day, bar }, quote: { mid, half } });
}

function bar(state: AccountState, q: Partial<SegmentQuote> & { open: number }, at = { day: 0, bar: 11 }) {
  const quote: SegmentQuote = { high: q.open, low: q.open, half: HALF, ...q };
  return processOrders(state, () => quote, at);
}

function only(state: AccountState): Order {
  const o = state.orders.at(-1);
  if (!o) throw new Error('no order');
  return o;
}

/** An account holding 10 KO bought at $100 with no spread. */
function holdingKo(): AccountState {
  return place(noSpread, { ticker: 'KO', side: 'buy', type: 'market', amount: { kind: 'shares', value: 10 } }, 100, 1, 0, 0).state;
}

describe('orders', () => {
  it('fills a market order at once at the price plus half the spread', () => {
    const { state, order } = place(noSpread, { ticker: 'KO', side: 'buy', type: 'market', amount: { kind: 'dollars', value: 1_000 } }, 50);
    expect(order.status).toBe('filled');
    expect(order.fillPrice).toBeCloseTo(50.05, 9);
    expect(state.positions.KO?.shares).toBeCloseTo(1_000 / 50.05, 5);
    expect(state.fills[0]?.orderId).toBe(order.id);
  });

  it('queues a market order placed after the close and fills it at the next open', () => {
    const draft: OrderDraft = { ticker: 'KO', side: 'buy', type: 'market', amount: { kind: 'shares', value: 2 } };
    let { state, order } = place(noSpread, draft, 50, BARS_PER_DAY);
    expect(order.status).toBe('open');
    // Still day 0 (e.g. a later look at the close): nothing happens.
    expect(processOrders(state, () => ({ open: 50, high: 50, low: 50, half: HALF }), { day: 0, bar: BARS_PER_DAY }).changed).toEqual([]);
    state = expireDayOrders(state, 0).state;
    expect(only(state).status).toBe('open');
    state = bar(state, { open: 47 }, { day: 1, bar: 0 }).state;
    expect(only(state).status).toBe('filled');
    expect(only(state).fillPrice).toBeCloseTo(47 * 1.001, 9);
    expect(only(state).filledAt).toEqual({ day: 1, bar: 0 });
  });

  it('fills a buy limit when the ask touches it, at the limit or better', () => {
    let { state } = place(noSpread, { ticker: 'KO', side: 'buy', type: 'limit', limitPrice: 95, amount: { kind: 'shares', value: 1 } }, 100);
    expect(only(state).status).toBe('open');
    state = bar(state, { open: 100, high: 101, low: 96 }).state;
    expect(only(state).status).toBe('open');
    state = bar(state, { open: 98, high: 98, low: 94 }).state;
    expect(only(state).status).toBe('filled');
    expect(only(state).fillPrice).toBe(95);
  });

  it('fills a buy limit at the open when the price gaps below it', () => {
    let { state } = place(noSpread, { ticker: 'KO', side: 'buy', type: 'limit', limitPrice: 95, amount: { kind: 'shares', value: 1 } }, 100);
    state = bar(state, { open: 90, high: 92, low: 89 }).state;
    expect(only(state).fillPrice).toBeCloseTo(90 * 1.001, 9);
  });

  it('fills a sell limit when the bid touches it', () => {
    let { state } = place(holdingKo(), { ticker: 'KO', side: 'sell', type: 'limit', limitPrice: 110, amount: { kind: 'shares', value: 10 } }, 100);
    state = bar(state, { open: 105, high: 110.05, low: 104 }).state;
    expect(only(state).status).toBe('open');
    state = bar(state, { open: 109, high: 111, low: 108 }).state;
    expect(only(state).fillPrice).toBe(110);
    expect(state.positions.KO).toBeUndefined();
    expect(state.realised).toBeCloseTo(100, 9);
  });

  it('triggers a stop-loss on a bar that trades through it', () => {
    let { state, order } = place(holdingKo(), { ticker: 'KO', side: 'sell', type: 'stop', stopPrice: 90, amount: { kind: 'shares', value: 10 } }, 100);
    expect(order.status).toBe('open');
    state = bar(state, { open: 95, high: 96, low: 89 }).state;
    expect(only(state).status).toBe('filled');
    expect(only(state).fillPrice).toBeCloseTo(90 * 0.999, 9);
  });

  it('slips a gapped-through stop to the gap price', () => {
    const draft: OrderDraft = { ticker: 'KO', side: 'sell', type: 'stop', stopPrice: 90, tif: 'gtc', amount: { kind: 'shares', value: 10 } };
    let { state } = place(holdingKo(), draft, 100, 70);
    state = expireDayOrders(state, 0).state;
    // Overnight news: the next day opens at $80, far below the stop.
    state = bar(state, { open: 80 }, { day: 1, bar: 0 }).state;
    expect(only(state).fillPrice).toBeCloseTo(80 * 0.999, 9);
    expect(state.realised).toBeCloseTo(10 * (80 * 0.999 - 100), 9);
  });

  it('fills a buy stop when the price rises to it', () => {
    let { state } = place(noSpread, { ticker: 'KO', side: 'buy', type: 'stop', stopPrice: 105, amount: { kind: 'shares', value: 1 } }, 100);
    state = bar(state, { open: 104, high: 106, low: 103 }).state;
    expect(only(state).fillPrice).toBeCloseTo(105 * 1.001, 9);
  });

  it('leaves an untouched limit open and expires a day order at the close', () => {
    let { state } = place(noSpread, { ticker: 'KO', side: 'buy', type: 'limit', limitPrice: 80, amount: { kind: 'shares', value: 1 } }, 100);
    state = bar(state, { open: 100, high: 102, low: 97 }).state;
    expect(only(state).status).toBe('open');
    const r = expireDayOrders(state, 0);
    expect(r.changed.map((o) => o.status)).toEqual(['expired']);
    expect(only(r.state).status).toBe('expired');
  });

  it('keeps a good-till-cancelled order across days, and cancels it', () => {
    let { state } = place(noSpread, { ticker: 'KO', side: 'buy', type: 'limit', limitPrice: 80, tif: 'gtc', amount: { kind: 'shares', value: 1 } }, 100);
    state = expireDayOrders(state, 0).state;
    expect(only(state).status).toBe('open');
    const c = cancelOrder(state, only(state).id);
    expect(c.order?.status).toBe('cancelled');
    expect(cancelOrder(c.state, only(state).id).reason).toBe('That order is already cancelled.');
    expect(bar(c.state, { open: 70, low: 60, high: 75 }).changed).toEqual([]);
  });

  it('re-checks cash at fill time and rejects in plain words', () => {
    let { state } = place(noSpread, { ticker: 'KO', side: 'buy', type: 'limit', limitPrice: 95, amount: { kind: 'dollars', value: 6_000 } }, 100);
    state = place(state, { ticker: 'MSFT', side: 'buy', type: 'market', amount: { kind: 'dollars', value: 5_000 } }, 300).state;
    state = processOrders(state, (t) => (t === 'KO' ? { open: 94, high: 94, low: 94, half: 0 } : undefined), { day: 0, bar: 11 }).state;
    const ko = state.orders[0];
    expect(ko?.status).toBe('rejected');
    expect(ko?.reason).toMatch(/^Not enough cash/);
  });

  it('rejects bad orders when placed', () => {
    const sell = place(noSpread, { ticker: 'KO', side: 'sell', type: 'stop', stopPrice: 90, amount: { kind: 'shares', value: 1 } }, 100);
    expect(sell.order).toMatchObject({ status: 'rejected', reason: "You don't own any KO." });
    const limit = place(noSpread, { ticker: 'KO', side: 'buy', type: 'limit', amount: { kind: 'shares', value: 1 } }, 100);
    expect(limit.order.reason).toBe('Set a limit price above zero.');
    const missing = placeOrder(noSpread, { ticker: 'ZZZ', side: 'buy', type: 'market', amount: { kind: 'shares', value: 1 } }, { at: { day: 0, bar: 0 }, quote: undefined });
    expect(missing.order.reason).toBe("ZZZ doesn't trade in this market.");
    expect(missing.state.nextOrderId).toBe(2);
  });

  it('fills a limit at once when it is already marketable', () => {
    const { order } = place(noSpread, { ticker: 'KO', side: 'buy', type: 'limit', limitPrice: 105, amount: { kind: 'shares', value: 1 } }, 100);
    expect(order.status).toBe('filled');
    expect(order.fillPrice).toBeCloseTo(100.1, 9);
  });

  it('says exactly what an order does', () => {
    expect(describeOrder({ ticker: 'NVDA', side: 'buy', type: 'market', amount: { kind: 'dollars', value: 1_000 } })).toBe('Buy $1,000 of NVDA');
    expect(describeOrder({ ticker: 'KO', side: 'sell', type: 'market', amount: { kind: 'shares', value: 3 } })).toBe('Sell 3 shares of KO');
    expect(describeOrder({ ticker: 'NVDA', side: 'sell', type: 'stop', stopPrice: 812.4, amount: { kind: 'shares', value: 1 } })).toBe(
      'Set a stop-loss on NVDA at $812.40',
    );
  });

  it('is deterministic for the same orders and prices', () => {
    const run = () => {
      let s = holdingKo();
      s = place(s, { ticker: 'KO', side: 'sell', type: 'stop', stopPrice: 97, amount: { kind: 'shares', value: 4 }, tif: 'gtc' }, 100).state;
      s = place(s, { ticker: 'KO', side: 'buy', type: 'limit', limitPrice: 95, amount: { kind: 'dollars', value: 500 }, tif: 'gtc' }, 100).state;
      for (let k = 0; k < 20; k++) {
        const open = 100 - k * 0.6;
        s = bar(s, { open, high: open + 0.4, low: open - 0.7 }, { day: 0, bar: 11 + k }).state;
      }
      return s;
    };
    const a = run();
    expect(a.orders.map((o) => o.status)).toEqual(['filled', 'filled', 'filled']);
    expect(run()).toEqual(a);
  });
});

describe('order messages', () => {
  it('says what happened in plain words', () => {
    const filled = place(noSpread, { ticker: 'KO', side: 'buy', type: 'market', amount: { kind: 'shares', value: 2 } }, 50, 10, 0, 0).order;
    expect(orderMessage(filled)).toBe('Bought 2 shares of KO at $50.00.');
    const queued = place(noSpread, { ticker: 'KO', side: 'buy', type: 'market', amount: { kind: 'dollars', value: 500 } }, 50, BARS_PER_DAY).order;
    expect(orderMessage(queued)).toBe('Market closed. Buy $500 of KO at the next open.');
    const limit = place(noSpread, { ticker: 'KO', side: 'buy', type: 'limit', limitPrice: 45, amount: { kind: 'shares', value: 1 } }, 50).order;
    expect(orderMessage(limit)).toBe('Order placed: Buy 1 share of KO at $45.00 or less.');
  });
});
