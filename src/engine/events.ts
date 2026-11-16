import { dayNumbersOf, daysFromCivil, type IsoDate, toDayNumber } from './calendar';
import { jumpSize } from './factors';
import type { Instrument } from './instruments';
import { BARS_PER_DAY } from './intraday';
import { childSeed, createRng, normal } from './rng';
import type { ScenarioDef } from './scenarios';

/**
 * Things that happen in a run besides the price noise: scenario headlines, quarterly
 * earnings and random company news. Built once with the market from the run seed, so a
 * replay has exactly the same news on the same days.
 */
export type EventKind = 'headline' | 'earnings' | 'news';
export type EarningsResult = 'beat' | 'inline' | 'miss';
export type Tone = 'up' | 'down' | 'flat';

export interface MarketEvent {
  day: number;
  /** When it appears: 0 = before the open (overnight news), 78 = at the close. */
  bar: number;
  kind: EventKind;
  /** The stock it is about; null for market-wide headlines. */
  ticker: string | null;
  /** Overnight log gap it causes at that day's open (0 for headlines). */
  move: number;
  tone: Tone;
  result?: EarningsResult;
  /** Seeded choice of wording for earnings and news. */
  variant: number;
  /** Headlines carry their own text. */
  text?: string;
}

/** Reports land this many calendar days after a quarter ends (the usual reporting weeks). */
export const EARNINGS_WINDOW = { from: 12, to: 45 } as const;

/** Chance of each result; most companies beat the (low) bar analysts set. */
const BEAT_P = 0.7;
const INLINE_P = 0.1;
/**
 * Average reaction to each result, in units of the stock's jump size. Centred so earnings
 * don't drift prices on average; the noise means a beat can still fall and a miss can rise.
 */
const REACTION: Record<EarningsResult, number> = { beat: 0.41, inline: -0.29, miss: -1.29 };
const REACTION_NOISE = 0.8;

/** Number of wordings to pick from (see `headlines.ts`). */
export const VARIANTS = 7;

/** A move smaller than this reads as flat. */
const FLAT = 0.005;

export function toneOf(move: number): Tone {
  if (move > FLAT) return 'up';
  if (move < -FLAT) return 'down';
  return 'flat';
}

/**
 * Calendar days after quarter end when a ticker reports. Fixed per company, whatever the
 * seed, so it reports in the same week every quarter like a real one.
 */
export function earningsSlot(ticker: string): number {
  const rand = createRng(childSeed(0x5eed, `earnings-slot:${ticker}`));
  const span = EARNINGS_WINDOW.to - EARNINGS_WINDOW.from + 1;
  return EARNINGS_WINDOW.from + Math.floor(rand() * span);
}

/** Index of the first date on or after `target` (a day number), or -1. */
function firstOnOrAfter(dayNumbers: readonly number[], target: number): number {
  let lo = 0;
  let hi = dayNumbers.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((dayNumbers[mid] ?? 0) < target) lo = mid + 1;
    else hi = mid;
  }
  return lo < dayNumbers.length ? lo : -1;
}

/** Days in the run when a ticker reports earnings (one per quarter in the run). */
export function earningsDays(dates: readonly IsoDate[], ticker: string): number[] {
  if (dates.length === 0) return [];
  const nums = dayNumbersOf(dates);
  const first = nums[0] ?? 0;
  const last = nums[nums.length - 1] ?? 0;
  const slot = earningsSlot(ticker);
  const startYear = Number(dates[0]?.slice(0, 4)) - 1;
  const endYear = Number(dates[dates.length - 1]?.slice(0, 4));
  const out: number[] = [];
  for (let y = startYear; y <= endYear; y++) {
    for (const [m, d] of [
      [3, 31],
      [6, 30],
      [9, 30],
      [12, 31],
    ] as const) {
      const target = daysFromCivil(y, m, d) + slot;
      if (target < first || target > last) continue;
      const i = firstOnOrAfter(nums, target);
      if (i >= 0) out.push(i);
    }
  }
  return out;
}

export interface EarningsPlan {
  /** Log gap per day from earnings (0 on other days). */
  jumps: Float64Array;
  events: MarketEvent[];
}

/** Earnings dates, results and price reactions for one stock. */
export function planEarnings(seed: number, inst: Instrument, dates: readonly IsoDate[], scale = 1): EarningsPlan {
  const jumps = new Float64Array(dates.length);
  const events: MarketEvent[] = [];
  const rand = createRng(childSeed(seed, `earnings:${inst.ticker}`));
  const sd = jumpSize(inst.vol) * scale;
  for (const day of earningsDays(dates, inst.ticker)) {
    const u = rand();
    const z = normal(rand);
    const variant = Math.floor(rand() * VARIANTS);
    const result: EarningsResult = u < BEAT_P ? 'beat' : u < BEAT_P + INLINE_P ? 'inline' : 'miss';
    const move = (REACTION[result] + REACTION_NOISE * z) * sd;
    jumps[day] = move;
    events.push({ day, bar: 0, kind: 'earnings', ticker: inst.ticker, move, tone: toneOf(move), result, variant });
  }
  return { jumps, events };
}

/** A headline for each random news jump of one stock. */
export function newsEvents(seed: number, ticker: string, news: ArrayLike<number>): MarketEvent[] {
  const rand = createRng(childSeed(seed, `news:${ticker}`));
  const out: MarketEvent[] = [];
  for (let day = 0; day < news.length; day++) {
    const move = news[day] ?? 0;
    if (move === 0) continue;
    out.push({ day, bar: 0, kind: 'news', ticker, move, tone: toneOf(move), variant: Math.floor(rand() * VARIANTS) });
  }
  return out;
}

/** Last trading day on or before a date, as a day index (-1 if before the run). */
function dayOnOrBefore(dates: readonly IsoDate[], date: IsoDate): number {
  const target = toDayNumber(date);
  let idx = -1;
  for (let i = 0; i < dates.length; i++) {
    if (toDayNumber(dates[i] ?? '') <= target) idx = i;
    else break;
  }
  return idx;
}

/** The scenario's own headlines, placed on their trading days. */
export function scenarioHeadlines(def: ScenarioDef, dates: readonly IsoDate[]): MarketEvent[] {
  const out: MarketEvent[] = [];
  for (const h of def.headlines ?? []) {
    const day = dayOnOrBefore(dates, h.date);
    if (day < 0) continue;
    out.push({
      day,
      bar: h.at === 'open' ? 0 : BARS_PER_DAY,
      kind: 'headline',
      ticker: h.ticker ?? null,
      move: 0,
      tone: h.tone,
      variant: 0,
      text: h.text,
    });
  }
  return out;
}

const KIND_ORDER: Record<EventKind, number> = { headline: 0, earnings: 1, news: 2 };

/** Order events by time, then headlines first, then by size of move. */
export function sortEvents(events: MarketEvent[]): MarketEvent[] {
  return events.sort(
    (a, b) =>
      a.day - b.day ||
      a.bar - b.bar ||
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      Math.abs(b.move) - Math.abs(a.move) ||
      (a.ticker ?? '').localeCompare(b.ticker ?? ''),
  );
}

/** Offsets into a sorted event list: events of day d are `events.slice(index[d], index[d + 1])`. */
export function indexEvents(events: readonly MarketEvent[], days: number): Int32Array {
  const index = new Int32Array(days + 1);
  let e = 0;
  for (let d = 0; d <= days; d++) {
    while (e < events.length && (events[e]?.day ?? 0) < d) e++;
    index[d] = e;
  }
  return index;
}
