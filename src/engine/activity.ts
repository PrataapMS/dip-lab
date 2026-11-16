import type { Fill } from './account';
import type { Debrief } from './debrief';
import { eventsOn } from './market';
import type { Order, OrderType } from './orders';
import type { Run } from './run';

/**
 * What the player did, as plain facts for quests, streaks and badges. The worker sends these
 * as they happen; the UI adds its own (glossary, lessons, replays). Serialisable.
 */

export interface HoldingFact {
  ticker: string;
  sector: string | null;
  etf: boolean;
  /** Negative when short. */
  shares: number;
  value: number;
  /** Closes in a row it has been held, today's included. */
  heldDays: number;
}

export type Activity =
  /** An order was accepted (it may fill later). */
  | { kind: 'order'; type: OrderType; side: 'buy' | 'sell'; ticker: string; short: boolean }
  | {
      kind: 'fill';
      ticker: string;
      side: 'buy' | 'sell';
      orderType: OrderType | null;
      etf: boolean;
      short: boolean;
      forced: boolean;
      realised: number;
      day: number;
    }
  | {
      kind: 'close';
      day: number;
      value: number;
      prevValue: number;
      /** Fractions, e.g. 0.012 for +1.2%. */
      dayPct: number;
      spyPct: number;
      holdings: HoldingFact[];
      /** Dividend cash received today (owed on shorts not counted), and from which tickers. */
      dividends: number;
      dividendTickers: string[];
      /** Held tickers that reported earnings today. */
      earningsHeld: string[];
    }
  | { kind: 'marginCall'; day: number }
  /** A run finished: its debrief, how hard it was, and whether it was played to the end. */
  | { kind: 'runEnd'; debrief: Debrief; difficulty: number; complete: boolean; margin: boolean }
  /** UI-side facts. */
  | { kind: 'glossaryRead'; term: string }
  | { kind: 'lessonDone'; lesson: string }
  | { kind: 'replay'; day: number };

export function orderActivity(o: Order, held: number): Activity {
  return {
    kind: 'order',
    type: o.type,
    side: o.side,
    ticker: o.ticker,
    short: o.side === 'sell' ? held <= 0 : held < 0,
  };
}

export function fillActivity(run: Run, f: Fill): Activity {
  const order = f.orderId === null ? undefined : run.account.orders.find((o) => o.id === f.orderId);
  const i = run.indexOf(f.ticker);
  return {
    kind: 'fill',
    ticker: f.ticker,
    side: f.side,
    orderType: order?.type ?? null,
    etf: i !== undefined && run.market.instruments[i]?.kind === 'etf',
    short: !!f.short,
    forced: !!f.forced,
    realised: f.realised,
    day: f.at.day,
  };
}

/** Closes in a row each ticker now held has been held (by replaying fills). */
export function heldDays(fills: readonly Fill[], day: number): Map<string, number> {
  const pos = new Map<string, number>();
  const since = new Map<string, number>();
  for (const f of fills) {
    const before = pos.get(f.ticker) ?? 0;
    const after = before + (f.side === 'buy' ? f.shares : -f.shares);
    const flat = Math.abs(after) < 1e-9;
    pos.set(f.ticker, flat ? 0 : after);
    if (flat) since.delete(f.ticker);
    else if (Math.abs(before) < 1e-9) since.set(f.ticker, f.at.day);
  }
  const out = new Map<string, number>();
  for (const [ticker, from] of since) if (from <= day) out.set(ticker, day - from + 1);
  return out;
}

/** Facts about the close that just happened (call at bar 78). */
export function closeActivity(run: Run): Activity {
  const a = run.account;
  const day = run.clock.day;
  const start = a.settings.startingCash;
  const value = a.equityByDay[day] ?? run.marks().value;
  const prevValue = day > 0 ? (a.equityByDay[day - 1] ?? start) : start;
  const spyNow = run.indexClose(day + 1);
  const spyBefore = run.indexClose(day);
  const days = heldDays(a.fills, day);
  const holdings: HoldingFact[] = run.marks().positions.map((p) => {
    const i = run.indexOf(p.ticker);
    const inst = i === undefined ? undefined : run.market.instruments[i];
    return {
      ticker: p.ticker,
      sector: inst?.sector ?? null,
      etf: inst?.kind === 'etf',
      shares: p.shares,
      value: p.value,
      heldDays: days.get(p.ticker) ?? 1,
    };
  });
  const held = new Set(holdings.map((h) => h.ticker));
  const earningsHeld = eventsOn(run.market, day)
    .filter((e) => e.kind === 'earnings' && e.ticker && held.has(e.ticker))
    .map((e) => e.ticker as string);
  const paidToday = a.dividends.filter((d) => d.at.day === day && d.amount > 0);
  const dividends = paidToday.reduce((s, d) => s + d.amount, 0);
  return {
    kind: 'close',
    day,
    value,
    prevValue,
    dayPct: prevValue > 0 ? value / prevValue - 1 : 0,
    spyPct: spyBefore > 0 ? spyNow / spyBefore - 1 : 0,
    holdings,
    dividends,
    dividendTickers: [...new Set(paidToday.map((d) => d.ticker))],
    earningsHeld: [...new Set(earningsHeld)],
  };
}
