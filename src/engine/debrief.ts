import type { Fill } from './account';
import { fillPrice } from './costs';
import { BARS_PER_DAY, POINTS_PER_DAY } from './intraday';
import { dayBars } from './market';
import type { EndReason, Run } from './run';
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

export type MomentKind = 'soldNearLow' | 'stopSlippage' | 'allIn' | 'overtrading' | 'satOut';

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
  wins: number;
  closedTrades: number;
  best: TradeStat | null;
  worst: TradeStat | null;
  /** Largest single-stock share of the account at any close (funds don't count). */
  maxWeight: { ticker: string; weight: number; day: number } | null;
  /** Average share of the account invested at the closes. */
  avgInvested: number;
  moments: Moment[];
  grade: Grade;
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
}

/** Grade from return vs SPY (40), drawdown vs SPY's (30) and discipline (30), with caps. */
export function gradeRun(g: GradeInput): Grade {
  // Long runs compare yearly returns so a 10-year run isn't judged like a 3-month one.
  const excess =
    g.years > 1 ? Math.pow(Math.max(1 + g.ret, 1e-9), 1 / g.years) - Math.pow(Math.max(1 + g.spyRet, 1e-9), 1 / g.years) : g.ret - g.spyRet;
  const performance = clamp(20 + excess * 100 * 2, 0, 40);
  const ratio = g.dd / Math.max(g.spyDd, 0.02);
  const risk = clamp(30 * (2 - ratio), 0, 30);
  let discipline = 30;
  discipline -= clamp(g.costShare * 100 * 5, 0, 10);
  discipline -= clamp(g.panicSells * 5, 0, 10);
  discipline -= clamp((g.maxWeight - 0.25) * 40, 0, 10);
  if (g.tradesPerDay > RULES.tradesPerDay) discipline -= 5;
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
  if (g.maxWeight >= RULES.capC) capAt(64.9, `One stock was ${Math.round(g.maxWeight * 100)}% of your account, so the best grade is C.`);
  else if (g.maxWeight >= RULES.capB) capAt(79.9, `One stock was ${Math.round(g.maxWeight * 100)}% of your account, so the best grade is B.`);
  if (g.avgInvested < RULES.satOut) capAt(64.9, 'You were mostly in cash, so the best grade is C. Taking part is how you learn.');
  return { letter: letterFor(score), score, performance, risk, discipline, cap };
}

/** Every sell's return on cost, plus positions still held, valued at the final price. */
function tradeStats(run: Run, fills: readonly Fill[], finalPrice: (ticker: string) => number, endDay: number): TradeStat[] {
  const out: TradeStat[] = [];
  for (const f of fills) {
    if (f.side !== 'sell') continue;
    const proceeds = f.shares * f.price - f.commission;
    const basis = proceeds - f.realised;
    out.push({ ticker: f.ticker, pct: basis > 0 ? f.realised / basis : 0, dollars: f.realised, open: false, day: f.at.day });
  }
  for (const [ticker, pos] of Object.entries(run.account.positions)) {
    if (pos.shares <= 0 || pos.costBasis <= 0) continue;
    const dollars = pos.shares * finalPrice(ticker) - pos.costBasis;
    out.push({ ticker, pct: dollars / pos.costBasis, dollars, open: true, day: endDay });
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
  for (let d = 0; d < a.equityByDay.length; d++) spy.push(spyShares * (spyCloses?.[d + 1] ?? 0) * (run.indexFactor[d] ?? 1));
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
  for (let d = 0; d < a.equityByDay.length; d++) {
    while (f < fills.length && (fills[f]?.at.day ?? 0) <= d) {
      const x = fills[f];
      if (x) held.set(x.ticker, (held.get(x.ticker) ?? 0) + (x.side === 'buy' ? x.shares : -x.shares));
      f++;
    }
    const equity = a.equityByDay[d] ?? 0;
    if (equity <= 0) continue;
    let invested = 0;
    for (const [ticker, shares] of held) {
      if (shares <= 1e-9) continue;
      const i = run.indexOf(ticker);
      const value = shares * (i === undefined ? 0 : (m.closes[i]?.[d + 1] ?? 0));
      invested += value;
      const w = value / equity;
      if (!isFund.has(ticker) && (!maxWeight || w > maxWeight.weight)) maxWeight = { ticker, weight: w, day: d };
    }
    investedSum += invested / equity;
  }
  const closesSeen = a.equityByDay.length;
  const avgInvested = closesSeen ? investedSum / closesSeen : run.marks().holdingsValue / Math.max(endValue, 1e-9);

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
  const panicGroups = new Map<string, { ticker: string; day: number; shares: number; price: number; realised: number }>();
  for (const x of fills) {
    if (x.side !== 'sell' || x.realised >= 0) continue;
    const key = `${x.ticker}:${x.at.day}`;
    const g = panicGroups.get(key) ?? { ticker: x.ticker, day: x.at.day, shares: 0, price: 0, realised: 0 };
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
    for (let d = Math.max(0, g.day - RULES.lowWindow); d <= Math.min(lastDay, g.day + RULES.lowWindow); d++) low = Math.min(low, closes[d + 1] ?? Infinity);
    const later = Math.min(lastDay, g.day + RULES.lowWindow);
    const after = closes[later + 1] ?? 0;
    if (later <= g.day || g.price > low * (1 + RULES.nearLow) || after < g.price * (1 + RULES.reboundAfter)) continue;
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

  // Overtrading.
  const costs = a.feesPaid + a.spreadPaid;
  const days = Math.max(1, closesSeen + (atClose ? 0 : 1));
  if (costs >= start * RULES.costShare || fills.length / days > RULES.tradesPerDay) {
    moments.push({
      kind: 'overtrading',
      title: 'Costs add up',
      lesson: `You paid ${usd(costs)} in spreads and fees over ${fills.length} trades (${((costs / start) * 100).toFixed(1)}% of your starting cash). Every trade costs a little.`,
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
    wins,
    closedTrades: stats.length,
    best,
    worst,
    maxWeight,
    avgInvested,
    moments: moments.slice(0, 3),
    grade,
  };
}
