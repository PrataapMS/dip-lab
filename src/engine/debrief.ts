import type { Fill } from './account';
import { fillPrice } from './costs';
import { BARS_PER_DAY, POINTS_PER_DAY } from './intraday';
import { dayBars } from './market';
import type { BranchOf, EndReason, Run } from './run';
import { TRADING_DAYS_PER_YEAR } from './synthetic';

/**
 * The end-of-run report: how the player did against buy-and-hold SPY, how risky the ride
 * was, what trading cost, the moments worth learning from, and a grade that rewards good
 * process rather than a lucky all-in bet. Pure: same run, same debrief.
 */

export interface TradeStat {
  ticker: string;
  /** Return on the cost of the shares, e.g. 0.18 for +18%. */
  pct: number;
  dollars: number;
  /** Still held at the end: valued at the final price, not actually sold. */
  open: boolean;
  day: number;
}

export type MomentKind =
  | 'soldNearLow'
  | 'stopSlippage'
  | 'allIn'
  | 'overtrading'
  | 'satOut'
  | 'marginCall'
  | 'forcedSale'
  | 'shortSqueeze';

export interface Moment {
  kind: MomentKind;
  title: string;
  lesson: string;
  /** Day it happened (for the chart marker and, later, replaying that day). */
  day: number;
  /** Rough dollar size, used to pick the three that mattered most. */
  impact: number;
}

export type Letter = 'A' | 'A-' | 'B+' | 'B' | 'B-' | 'C+' | 'C' | 'C-' | 'D' | 'F';

export interface Grade {
  letter: Letter;
  score: number;
  /** Out of 40, 30 and 30. */
  performance: number;
  risk: number;
  discipline: number;
  /** Why the grade was held down, if it was. */
  cap: string | null;
}

export interface Debrief {
  scenarioId: string;
  scenarioName: string;
  seed: number;
  reason: EndReason;
  /** Trading days played (closes, plus a part day if ended mid-session). */
  days: number;
  startValue: number;
  endValue: number;
  ret: number;
  spyEndValue: number;
  spyRet: number;
  /** Return minus SPY's, in percentage points. */
  excessPts: number;
  /** Account and buy-and-hold SPY value at each close, starting with the starting cash. */
  you: number[];
  spy: number[];
  /** Worst fall from a peak, as a positive fraction (0.079 = −7.9%). */
  worstDrawdown: number;
  spyWorstDrawdown: number;
  trades: number;
  fees: number;
  spread: number;
  dividends: number;
  /** Interest paid on borrowed cash. */
  interest: number;
  /** Fees for borrowing shares sold short, and dividends owed on them. */
  borrowFees: number;
  dividendsOwed: number;
  /** Margin calls received, and opens where the broker sold. */
  marginCalls: number;
  forcedSales: number;
  /** Average of holdings ÷ equity at the closes (above 1 means borrowed money was used). */
  avgLeverage: number;
  wins: number;
  closedTrades: number;
  best: TradeStat | null;
  worst: TradeStat | null;
  /** Largest single-stock share of the account at any close (funds don't count). */
  maxWeight: { ticker: string; weight: number; day: number } | null;
  /** Average share of the account invested at the closes (capped at 1). */
  avgInvested: number;
  moments: Moment[];
  grade: Grade;
  /** Set when this run replayed a moment of an earlier one. */
  branchOf: BranchOf | null;
  /** Losing sales near a low that then rebounded. */
  panicSells: number;
  /** Positions still held at the end. */
  endHoldings: number;
  /** Good calls worth a badge: the ticker, or null. */
  highlights: Highlights;
}

export interface Highlights {
  /** Bought within 3% of the 30-day low, and it rose 8%+ in the next 15 days. */
  boughtDip: string | null;
  /** Held through a 20%+ fall below cost and still came out ahead. */
  diamondHands: string | null;
  /** A stop-loss sold, and the stock fell 10%+ more within 15 days. */
  stopSaved: string | null;
}

/** Good calls in a run, for badges. Pure: same run, same answer. */
export function highlights(run: Run): Highlights {
  const m = run.market;
  const fills = run.account.fills;
  const lastDay = m.dates.length - 1;
  const closesOf = (t: string) => {
    const i = run.indexOf(t);
    return i === undefined ? undefined : m.closes[i];
  };
  const out: Highlights = { boughtDip: null, diamondHands: null, stopSaved: null };
  const byId = new Map(run.account.orders.map((o) => [o.id, o]));
  for (const f of fills) {
    const c = closesOf(f.ticker);
    if (!c || f.short || f.forced) continue;
    const d = f.at.day;
    if (f.side === 'buy' && !out.boughtDip && d + RULES.lowWindow <= lastDay) {
      let low = Infinity;
      for (let k = Math.max(0, d - 30); k <= d; k++) low = Math.min(low, c[k + 1] ?? Infinity);
      if (
        f.mid <= low * (1 + RULES.nearLow) &&
        (c[d + RULES.lowWindow + 1] ?? 0) >= f.mid * (1 + RULES.reboundAfter)
      )
        out.boughtDip = f.ticker;
    }
    const o = f.orderId === null ? undefined : byId.get(f.orderId);
    if (f.side === 'sell' && o?.type === 'stop' && !out.stopSaved) {
      let low = Infinity;
      for (let k = d; k <= Math.min(lastDay, d + RULES.lowWindow); k++)
        low = Math.min(low, c[k + 1] ?? Infinity);
      if (low <= f.price * 0.9) out.stopSaved = f.ticker;
    }
  }
  // Diamond hands: follow each long position from open to close (or the end).
  const book = new Map<string, { shares: number; cost: number; from: number; worst: number }>();
  const worstSince = (t: string, from: number, to: number, avg: number) => {
    const c = closesOf(t);
    let worst = Infinity;
    for (let k = from; k <= to; k++) worst = Math.min(worst, (c?.[k + 1] ?? Infinity) / avg);
    return worst;
  };
  for (const f of fills) {
    if (f.short) continue;
    const b = book.get(f.ticker) ?? { shares: 0, cost: 0, from: f.at.day, worst: Infinity };
    if (f.side === 'buy') {
      book.set(f.ticker, {
        ...b,
        shares: b.shares + f.shares,
        cost: b.cost + f.shares * f.price + f.commission,
        from: b.shares > 0 ? b.from : f.at.day,
      });
      continue;
    }
    if (b.shares <= 0) continue;
    const avg = b.cost / b.shares;
    const worst = Math.min(b.worst, worstSince(f.ticker, b.from, f.at.day, avg));
    const part = f.shares / b.shares;
    if (f.realised > 0 && worst <= 0.8 && !out.diamondHands) out.diamondHands = f.ticker;
    const left = b.shares - f.shares;
    book.set(
      f.ticker,
      left > 1e-9
        ? { shares: left, cost: b.cost * (1 - part), from: b.from, worst }
        : { shares: 0, cost: 0, from: f.at.day, worst: Infinity },
    );
  }
  const end = run.clock.day;
  for (const [t, b] of book) {
    if (b.shares <= 0 || out.diamondHands) continue;
    const i = run.indexOf(t);
    const price = i === undefined ? 0 : run.mid(i);
    const worst = Math.min(b.worst, worstSince(t, b.from, end, b.cost / b.shares));
    if (worst <= 0.8 && b.shares * price > b.cost) out.diamondHands = t;
  }
  return out;
}

/** Thresholds for the flagged moments and the grade. */
export const RULES = {
  /** "Sold near the low": within this much of the stock's low over the surrounding days… */
  nearLow: 0.03,
  lowWindow: 15,
  /** …and it rose at least this much over the next `lowWindow` days. */
  reboundAfter: 0.08,
  /** A stop that filled this much worse than its stop price slipped. */
  slippage: 0.01,
  /** A single stock at this share of the account is "all-in". */
  allIn: 0.35,
  /** Spreads and fees above this share of starting cash is overtrading. */
  costShare: 0.01,
  tradesPerDay: 2,
  /** Less than this invested on average is sitting out. */
  satOut: 0.25,
  /** Grade caps for concentration. */
  capB: 0.5,
  capC: 0.8,
  /** Average leverage above this costs discipline. */
  leverage: 1.5,
  /** A short that went this far against you is a squeeze. */
  squeeze: 0.2,
} as const;

const LETTERS: [number, Letter][] = [
  [90, 'A'],
  [85, 'A-'],
  [80, 'B+'],
  [75, 'B'],
  [70, 'B-'],
  [65, 'C+'],
  [60, 'C'],
  [55, 'C-'],
  [45, 'D'],
];

export function letterFor(score: number): Letter {
  return LETTERS.find(([min]) => score >= min)?.[1] ?? 'F';
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Worst fall from a running peak, as a positive fraction. */
export function worstDrawdown(values: readonly number[]): number {
  let peak = values[0] ?? 0;
  let worst = 0;
  for (const v of values) {
    if (v > peak) peak = v;
    if (peak > 0) worst = Math.max(worst, 1 - v / peak);
  }
  return worst;
}

function pct(x: number, digits = 0): string {
  const v = x * 100;
  return `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(digits)}%`;
}

function usd(x: number): string {
  return `$${Math.abs(x).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function usdCents(x: number): string {
  return `$${x.toFixed(2)}`;
}

interface GradeInput {
  ret: number;
  spyRet: number;
  years: number;
  dd: number;
  spyDd: number;
  costShare: number;
  panicSells: number;
  maxWeight: number;
  tradesPerDay: number;
  avgInvested: number;
  bust: boolean;
  /** Defaults: no margin used. */
  marginCalls?: number;
  forcedSales?: number;
  avgLeverage?: number;
}

/** Grade from return vs SPY (40), drawdown vs SPY's (30) and discipline (30), with caps. */
export function gradeRun(g: GradeInput): Grade {
  // Long runs compare yearly returns so a 10-year run isn't judged like a 3-month one.
  const excess =
    g.years > 1
      ? Math.pow(Math.max(1 + g.ret, 1e-9), 1 / g.years) -
        Math.pow(Math.max(1 + g.spyRet, 1e-9), 1 / g.years)
      : g.ret - g.spyRet;
  const performance = clamp(20 + excess * 100 * 2, 0, 40);
  const ratio = g.dd / Math.max(g.spyDd, 0.02);
  const risk = clamp(30 * (2 - ratio), 0, 30);
  let discipline = 30;
  discipline -= clamp(g.costShare * 100 * 5, 0, 10);
  discipline -= clamp(g.panicSells * 5, 0, 10);
  discipline -= clamp((g.maxWeight - 0.25) * 40, 0, 10);
  if (g.tradesPerDay > RULES.tradesPerDay) discipline -= 5;
  if ((g.avgLeverage ?? 0) > RULES.leverage) discipline -= 5;
  discipline -= clamp((g.marginCalls ?? 0) * 5, 0, 10);
  discipline = Math.max(0, discipline);
  let score = performance + risk + discipline;
  let cap: string | null = null;
  const capAt = (max: number, why: string) => {
    if (score > max) {
      score = max;
      cap = why;
    }
  };
  if (g.bust) capAt(0, 'The account went bust.');
  if (g.maxWeight >= RULES.capC)
    capAt(
      64.9,
      `One stock was ${Math.round(g.maxWeight * 100)}% of your account, so the best grade is C.`,
    );
  else if (g.maxWeight >= RULES.capB)
    capAt(
      79.9,
      `One stock was ${Math.round(g.maxWeight * 100)}% of your account, so the best grade is B.`,
    );
  if ((g.forcedSales ?? 0) > 0)
    capAt(69.9, 'Your broker had to sell for you after a margin call, so the best grade is C+.');
  if (g.avgInvested < RULES.satOut)
    capAt(64.9, 'You were mostly in cash, so the best grade is C. Taking part is how you learn.');
  return { letter: letterFor(score), score, performance, risk, discipline, cap };
}

/**
 * Every sale's return on cost (and every short cover's return on what the short sale brought
 * in), plus positions still held, valued at the final price.
 */
function tradeStats(
  run: Run,
  fills: readonly Fill[],
  finalPrice: (ticker: string) => number,
  endDay: number,
): TradeStat[] {
  const out: TradeStat[] = [];
  for (const f of fills) {
    if (f.side === 'sell' && !f.short) {
      const proceeds = f.shares * f.price - f.commission;
      const basis = proceeds - f.realised;
      out.push({
        ticker: f.ticker,
        pct: basis > 0 ? f.realised / basis : 0,
        dollars: f.realised,
        open: false,
        day: f.at.day,
      });
    } else if (f.side === 'buy' && f.short) {
      const shortProceeds = f.realised + f.shares * f.price + f.commission;
      out.push({
        ticker: f.ticker,
        pct: shortProceeds > 0 ? f.realised / shortProceeds : 0,
        dollars: f.realised,
        open: false,
        day: f.at.day,
      });
    }
  }
  for (const [ticker, pos] of Object.entries(run.account.positions)) {
    if (pos.shares === 0 || pos.costBasis === 0) continue;
    const dollars = pos.shares * finalPrice(ticker) - pos.costBasis;
    out.push({ ticker, pct: dollars / Math.abs(pos.costBasis), dollars, open: true, day: endDay });
  }
  return out;
}

export function debrief(run: Run): Debrief {
  const m = run.market;
  const a = run.account;
  const start = a.settings.startingCash;
  const endDay = run.clock.day;
  const atClose = run.clock.bar >= BARS_PER_DAY;
  const endValue = run.marks().value;
  const you = [start, ...a.equityByDay];
  if (!atClose) you.push(endValue);

  // Buy-and-hold SPY: all the cash at the first open, same spread and commission, dividends reinvested.
  const s = run.indexInstrument;
  const spyCloses = m.closes[s];
  const firstOpen = s >= 0 ? (dayBars(m, 0).points[s * POINTS_PER_DAY] ?? 0) : 0;
  const buyPrice = fillPrice(firstOpen, 'buy', run.halfSpreadOf(s, 0));
  const spyShares = buyPrice > 0 ? Math.max(0, start - a.settings.commission) / buyPrice : 0;
  const spy = [start];
  for (let d = 0; d < a.equityByDay.length; d++)
    spy.push(spyShares * (spyCloses?.[d + 1] ?? 0) * (run.indexFactor[d] ?? 1));
  if (!atClose) spy.push(spyShares * run.mid(s) * (run.indexFactor[endDay] ?? 1));
  const spyEndValue = spy[spy.length - 1] ?? start;

  const ret = endValue / start - 1;
  const spyRet = spyEndValue / start - 1;
  const dd = worstDrawdown(you);
  const spyDd = worstDrawdown(spy);

  // Replay fills to know holdings at each close: concentration and time invested.
  const isFund = new Set(m.instruments.filter((i) => i.kind === 'etf').map((i) => i.ticker));
  const fills = a.fills;
  const held = new Map<string, number>();
  let f = 0;
  let maxWeight: Debrief['maxWeight'] = null;
  let investedSum = 0;
  let leverageSum = 0;
  // Shorts: shares and sale proceeds still open per ticker, and the worst move against each.
  const shortBook = new Map<string, { shares: number; proceeds: number }>();
  const squeezes = new Map<string, { against: number; day: number; dollars: number }>();
  for (let d = 0; d < a.equityByDay.length; d++) {
    while (f < fills.length && (fills[f]?.at.day ?? 0) <= d) {
      const x = fills[f];
      if (x)
        held.set(x.ticker, (held.get(x.ticker) ?? 0) + (x.side === 'buy' ? x.shares : -x.shares));
      if (x?.short) {
        const b = shortBook.get(x.ticker) ?? { shares: 0, proceeds: 0 };
        if (x.side === 'sell')
          shortBook.set(x.ticker, {
            shares: b.shares + x.shares,
            proceeds: b.proceeds + x.shares * x.price,
          });
        else if (b.shares > 0) {
          const left = Math.max(0, b.shares - x.shares);
          shortBook.set(x.ticker, { shares: left, proceeds: (b.proceeds * left) / b.shares });
        }
      }
      f++;
    }
    const equity = a.equityByDay[d] ?? 0;
    if (equity <= 0) continue;
    let invested = 0;
    for (const [ticker, shares] of held) {
      if (Math.abs(shares) <= 1e-9) continue;
      const i = run.indexOf(ticker);
      const value = Math.abs(shares) * (i === undefined ? 0 : (m.closes[i]?.[d + 1] ?? 0));
      invested += value;
      const w = value / equity;
      if (!isFund.has(ticker) && (!maxWeight || w > maxWeight.weight))
        maxWeight = { ticker, weight: w, day: d };
    }
    for (const [ticker, b] of shortBook) {
      if (b.shares <= 1e-9) continue;
      const i = run.indexOf(ticker);
      const close = i === undefined ? 0 : (m.closes[i]?.[d + 1] ?? 0);
      const avg = b.proceeds / b.shares;
      const against = avg > 0 ? close / avg - 1 : 0;
      if (against > (squeezes.get(ticker)?.against ?? 0))
        squeezes.set(ticker, { against, day: d, dollars: b.shares * (close - avg) });
    }
    investedSum += Math.min(1, invested / equity);
    leverageSum += invested / equity;
  }
  const closesSeen = a.equityByDay.length;
  const nowGross =
    run.marks().positions.reduce((s, p) => s + Math.abs(p.value), 0) / Math.max(endValue, 1e-9);
  const avgInvested = closesSeen ? investedSum / closesSeen : Math.min(1, nowGross);
  const avgLeverage = closesSeen ? leverageSum / closesSeen : nowGross;

  const finalPrice = (ticker: string) => {
    const i = run.indexOf(ticker);
    return i === undefined ? 0 : run.mid(i);
  };
  const stats = tradeStats(run, fills, finalPrice, endDay);
  const wins = stats.filter((t) => t.pct > 0).length;
  const sorted = [...stats].sort((x, y) => y.pct - x.pct);
  const best = sorted[0] ?? null;
  const worst = sorted.length > 1 ? (sorted[sorted.length - 1] ?? null) : null;

  const moments: Moment[] = [];
  const lastDay = m.dates.length - 1;

  // Sold near the low: losing sells close to the stock's low that then rebounded.
  const panicGroups = new Map<
    string,
    { ticker: string; day: number; shares: number; price: number; realised: number }
  >();
  for (const x of fills) {
    if (x.side !== 'sell' || x.short || x.forced || x.realised >= 0) continue;
    const key = `${x.ticker}:${x.at.day}`;
    const g = panicGroups.get(key) ?? {
      ticker: x.ticker,
      day: x.at.day,
      shares: 0,
      price: 0,
      realised: 0,
    };
    g.price = (g.price * g.shares + x.mid * x.shares) / (g.shares + x.shares);
    g.shares += x.shares;
    g.realised += x.realised;
    panicGroups.set(key, g);
  }
  let panicSells = 0;
  for (const g of panicGroups.values()) {
    const i = run.indexOf(g.ticker);
    const closes = i === undefined ? undefined : m.closes[i];
    if (!closes) continue;
    let low = Infinity;
    for (
      let d = Math.max(0, g.day - RULES.lowWindow);
      d <= Math.min(lastDay, g.day + RULES.lowWindow);
      d++
    )
      low = Math.min(low, closes[d + 1] ?? Infinity);
    const later = Math.min(lastDay, g.day + RULES.lowWindow);
    const after = closes[later + 1] ?? 0;
    if (
      later <= g.day ||
      g.price > low * (1 + RULES.nearLow) ||
      after < g.price * (1 + RULES.reboundAfter)
    )
      continue;
    panicSells++;
    moments.push({
      kind: 'soldNearLow',
      title: 'Sold near the low',
      lesson: `You sold ${g.ticker} at a loss within ${Math.round(RULES.nearLow * 100)}% of its low. ${later - g.day} trading days later it was ${pct(after / g.price - 1)} higher.`,
      day: g.day,
      impact: g.shares * (after - g.price),
    });
  }

  // Stop-loss slippage: stops that filled well past their stop price.
  const byId = new Map(a.orders.map((o) => [o.id, o]));
  for (const x of fills) {
    const o = x.orderId === null ? undefined : byId.get(x.orderId);
    if (!o || o.type !== 'stop' || !o.stopPrice) continue;
    const worse = x.side === 'sell' ? o.stopPrice - x.price : x.price - o.stopPrice;
    if (worse < o.stopPrice * RULES.slippage) continue;
    moments.push({
      kind: 'stopSlippage',
      title: 'Stop-loss slippage',
      lesson: `Your ${x.ticker} stop was ${usdCents(o.stopPrice)}, but it filled at ${usdCents(x.price)} after the price gapped. Stops limit losses; they don't lock in a price.`,
      day: x.at.day,
      impact: worse * x.shares,
    });
  }

  // All-in on one stock.
  if (maxWeight && maxWeight.weight >= RULES.allIn) {
    const t = maxWeight.ticker;
    const pnl = stats.filter((x) => x.ticker === t).reduce((sum, x) => sum + x.dollars, 0);
    moments.push({
      kind: 'allIn',
      title: 'All-in on one ticker',
      lesson:
        pnl >= 0
          ? `${t} reached ${Math.round(maxWeight.weight * 100)}% of your account. It carried your gains, and it would have carried your losses too.`
          : `${t} reached ${Math.round(maxWeight.weight * 100)}% of your account, so its fall hit your whole account. Spreading money out limits the damage.`,
      day: maxWeight.day,
      impact: Math.abs(pnl),
    });
  }

  // Short squeezes: a short that went well against the player.
  for (const [ticker, s] of squeezes) {
    if (s.against < RULES.squeeze) continue;
    moments.push({
      kind: 'shortSqueeze',
      title: 'Short squeeze',
      lesson: `${ticker} rose ${pct(s.against)} above where you shorted it, ${usd(s.dollars)} against you on day ${s.day + 1}. A falling bet can lose more than you put in: there's no ceiling on a rising price.`,
      day: s.day,
      impact: s.dollars,
    });
  }

  // Margin calls and forced sales.
  const forcedDays = new Map<number, Fill[]>();
  for (const x of fills)
    if (x.forced) forcedDays.set(x.at.day, [...(forcedDays.get(x.at.day) ?? []), x]);
  for (const c of a.marginCalls) {
    const forced = [...forcedDays.entries()].find(([day]) => day > c.day && day <= c.day + 2);
    if (forced) {
      const [day, list] = forced;
      const sold = list.reduce((sum, x) => sum + x.shares * x.price, 0);
      const lost = list.reduce((sum, x) => sum + Math.min(0, x.realised), 0);
      moments.push({
        kind: 'forcedSale',
        title: 'Forced sale',
        lesson: `Your margin call went unmet, so your broker sold ${usd(sold)} of ${[...new Set(list.map((x) => x.ticker))].join(', ')} at the open on day ${day + 1}${lost < 0 ? `, locking in ${usd(lost)} of losses` : ''}. Borrowing doubles the ride both ways.`,
        day,
        impact: Math.max(Math.abs(lost), sold * 0.1),
      });
    } else {
      const equity = a.equityByDay[c.day] ?? start;
      moments.push({
        kind: 'marginCall',
        title: 'Margin call',
        lesson: `On day ${c.day + 1} your equity fell to ${Math.round(c.ratio * 100)}% of what you held, under the 30% minimum. With borrowed money, a fall hits you twice as hard.`,
        day: c.day,
        impact: equity * (RULES.leverage - 1),
      });
    }
  }

  // Overtrading.
  const costs = a.feesPaid + a.spreadPaid + a.interestPaid + a.borrowFeesPaid;
  const days = Math.max(1, closesSeen + (atClose ? 0 : 1));
  if (costs >= start * RULES.costShare || fills.length / days > RULES.tradesPerDay) {
    moments.push({
      kind: 'overtrading',
      title: 'Costs add up',
      lesson: `You paid ${usd(costs)} in spreads, fees${a.interestPaid + a.borrowFeesPaid > 0 ? ', interest and borrow fees' : ''} over ${fills.length} trades (${((costs / start) * 100).toFixed(1)}% of your starting cash). Every trade costs a little.`,
      day: fills[fills.length - 1]?.at.day ?? endDay,
      impact: costs,
    });
  }

  // Sat out.
  if (avgInvested < RULES.satOut) {
    moments.push({
      kind: 'satOut',
      title: 'Mostly in cash',
      lesson:
        spyRet > 0
          ? `You were ${Math.round(avgInvested * 100)}% invested on average while SPY returned ${pct(spyRet, 1)}. Cash is safe, but it doesn't grow.`
          : `You were ${Math.round(avgInvested * 100)}% invested on average. That dodged SPY's ${pct(spyRet, 1)}, but the grade rewards taking part with care.`,
      day: 0,
      impact: Math.abs(start * spyRet * (1 - avgInvested)),
    });
  }

  moments.sort((x, y) => y.impact - x.impact || x.day - y.day);

  const grade = gradeRun({
    ret,
    spyRet,
    years: days / TRADING_DAYS_PER_YEAR,
    dd,
    spyDd,
    costShare: costs / start,
    panicSells,
    maxWeight: maxWeight?.weight ?? 0,
    tradesPerDay: fills.length / days,
    avgInvested,
    bust: run.endReason === 'bust',
    marginCalls: a.marginCalls.length,
    forcedSales: forcedDays.size,
    avgLeverage,
  });

  return {
    scenarioId: m.scenario.id,
    scenarioName: m.scenario.name,
    seed: m.seed,
    reason: run.endReason ?? 'lastDay',
    days,
    startValue: start,
    endValue,
    ret,
    spyEndValue,
    spyRet,
    excessPts: (ret - spyRet) * 100,
    you,
    spy,
    worstDrawdown: dd,
    spyWorstDrawdown: spyDd,
    trades: fills.length,
    fees: a.feesPaid,
    spread: a.spreadPaid,
    dividends: a.dividendsReceived,
    interest: a.interestPaid,
    borrowFees: a.borrowFeesPaid,
    dividendsOwed: a.dividendsPaid,
    marginCalls: a.marginCalls.length,
    forcedSales: forcedDays.size,
    avgLeverage,
    wins,
    closedTrades: stats.length,
    best,
    worst,
    maxWeight,
    avgInvested,
    moments: moments.slice(0, 3),
    grade,
    branchOf: run.branchOf,
    panicSells,
    endHoldings: Object.values(a.positions).filter((p) => p.shares !== 0).length,
    highlights: highlights(run),
  };
}
