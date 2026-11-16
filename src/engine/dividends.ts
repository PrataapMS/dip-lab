import { dayNumbersOf, daysFromCivil, type IsoDate } from './calendar';
import type { Instrument } from './instruments';
import { childSeed, createRng } from './rng';

/**
 * Quarterly dividends. Each payer goes ex-dividend once a quarter: whoever held it at the
 * previous close gets cash, and the price opens lower by the dividend, as on a real ex-date.
 * The schedule depends only on the ticker, so it is the same in every run.
 */
export interface Dividend {
  day: number;
  /** Index in the market's instruments. */
  instrument: number;
  ticker: string;
  /** Cash per share. */
  perShare: number;
}

/** Fraction of the price paid each quarter. */
export function quarterlyYield(inst: Instrument): number {
  return inst.divYield > 0 ? inst.divYield / 4 : 0;
}

/**
 * Month offset of a payer's quarterly cycle (0: Jan/Apr/Jul/Oct, 1: Feb/May/Aug/Nov,
 * 2: Mar/Jun/Sep/Dec) and the day of the month it goes ex-dividend. Funds use the
 * Mar/Jun/Sep/Dec cycle like the big index ETFs.
 */
export function dividendCycle(inst: Instrument): { offset: number; dayOfMonth: number } {
  const rand = createRng(childSeed(0xd1, `dividend-cycle:${inst.ticker}`));
  const offset = Math.floor(rand() * 3);
  const dayOfMonth = 5 + Math.floor(rand() * 20);
  return inst.kind === 'etf'
    ? { offset: 2, dayOfMonth: 15 + (dayOfMonth % 7) }
    : { offset, dayOfMonth };
}

/** Days in the run when an instrument goes ex-dividend (empty for non-payers). */
export function exDividendDays(inst: Instrument, dates: readonly IsoDate[]): number[] {
  if (quarterlyYield(inst) === 0 || dates.length === 0) return [];
  const dayNumbers = dayNumbersOf(dates);
  const { offset, dayOfMonth } = dividendCycle(inst);
  const first = dayNumbers[0] ?? 0;
  const last = dayNumbers[dayNumbers.length - 1] ?? 0;
  const out: number[] = [];
  const y0 = Number(dates[0]?.slice(0, 4));
  const y1 = Number(dates[dates.length - 1]?.slice(0, 4));
  let i = 0;
  for (let y = y0; y <= y1; y++) {
    for (let q = 0; q < 4; q++) {
      const target = daysFromCivil(y, 1 + q * 3 + offset, dayOfMonth);
      if (target < first || target > last) continue;
      while (i < dayNumbers.length && (dayNumbers[i] ?? 0) < target) i++;
      if (i < dayNumbers.length) out.push(i);
    }
  }
  return out;
}

/**
 * Total-return multiplier for one instrument: holding it with dividends reinvested is worth
 * price × factor[d] on day d (factor 1 before the first ex-date).
 */
export function reinvestFactors(
  dividends: readonly Dividend[],
  instrument: number,
  closes: ArrayLike<number>,
  days: number,
): Float64Array {
  const factor = new Float64Array(days);
  let f = 1;
  let k = 0;
  const own = dividends.filter((d) => d.instrument === instrument);
  for (let day = 0; day < days; day++) {
    while (k < own.length && (own[k]?.day ?? 0) === day) {
      const prev = closes[day] ?? 0;
      const perShare = own[k]?.perShare ?? 0;
      // The dividend buys more shares at the ex-date price (previous close less the dividend).
      if (prev > perShare) f *= prev / (prev - perShare);
      k++;
    }
    factor[day] = f;
  }
  return factor;
}
