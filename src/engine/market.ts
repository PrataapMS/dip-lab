import type { IsoDate } from './calendar';
import { generateStockPath, idioVolFor, SECTOR_VOL } from './factors';
import type { Instrument } from './instruments';
import { BARS_PER_DAY, generateDayPath, POINTS_PER_DAY } from './intraday';
import { REFERENCE_MARKET_VOL } from './regimes';
import { childSeed, createRng, normal } from './rng';
import { buildScenarioMarket, buildSpecialPath, type ScenarioDef, type ScenarioMarket } from './scenarios';

/** A whole scenario's market: every instrument's daily closes, ready to play. */
export interface BuiltMarket {
  scenario: ScenarioDef;
  seed: number;
  dates: IsoDate[];
  instruments: Instrument[];
  factors: ScenarioMarket;
  /** Per instrument: price before day 0, then the close of each day (days + 1 values). */
  closes: Float32Array[];
  /** Per instrument: log news jump on each day (0 for none). */
  jumps: Float32Array[];
}

/** Deterministic, plausible starting price for a ticker (roughly $5 to $1,500). */
export function startPrice(seed: number, ticker: string): number {
  const rand = createRng(childSeed(seed, `price:${ticker}`));
  const p = 60 * Math.exp(0.9 * normal(rand));
  return Math.round(Math.min(Math.max(p, 5), 1500) * 100) / 100;
}

/** Instruments that existed when the scenario starts, plus its made-up stocks. */
export function instrumentsFor(def: ScenarioDef, universe: readonly Instrument[]): Instrument[] {
  const startYear = Number(def.start.slice(0, 4));
  const listed = universe.filter((i) => i.ipoYear <= startYear);
  const special: Instrument[] = (def.special ?? []).map((s) => ({
    ticker: s.ticker,
    name: s.name,
    kind: 'stock',
    sector: s.sector,
    beta: 0,
    vol: s.vol,
    idioVol: s.vol,
    divYield: 0,
    ipoYear: startYear,
  }));
  return [...listed, ...special];
}

export function buildMarket(def: ScenarioDef, seed: number, universe: readonly Instrument[]): BuiltMarket {
  const factors = buildScenarioMarket(def, seed);
  const instruments = instrumentsFor(def, universe);
  const marketFactor = { vols: factors.vols, returns: factors.returns };
  const closes: Float32Array[] = [];
  const jumps: Float32Array[] = [];
  for (const inst of instruments) {
    const special = def.special?.find((s) => s.ticker === inst.ticker);
    if (special) {
      closes.push(Float32Array.from(buildSpecialPath(special, factors.dates, seed)));
      jumps.push(new Float32Array(factors.dates.length));
      continue;
    }
    const sectorReturns = inst.sector ? factors.sectors[inst.sector] : null;
    const path = generateStockPath(seed, inst, startPrice(seed, inst.ticker), marketFactor, sectorReturns);
    closes.push(Float32Array.from(path.closes));
    jumps.push(Float32Array.from(path.jumps));
  }
  return { scenario: def, seed, dates: factors.dates, instruments, factors, closes, jumps };
}

/** An instrument's annualised volatility on a given day, used to shape its intraday path. */
export function instrumentVol(m: BuiltMarket, index: number, day: number): number {
  const inst = m.instruments[index];
  if (!inst) return 0;
  if (inst.beta === 0) return inst.vol;
  const mv = m.factors.vols[day] ?? REFERENCE_MARKET_VOL;
  const stress = mv / REFERENCE_MARKET_VOL;
  const sector = inst.sector ? (inst.sectorLoading ?? 1) * SECTOR_VOL * stress : 0;
  const idio = idioVolFor(inst);
  return Math.sqrt((inst.beta * mv) ** 2 + sector ** 2 + idio * idio * stress);
}

/**
 * Every instrument's 5-minute bars for one day, flattened:
 * points[i * POINTS_PER_DAY + p] is instrument i after `p` bars (0 = open, 78 = close), and
 * high/low[i * BARS_PER_DAY + k] is the range traded during bar k (from point k to k + 1).
 */
export interface DayBars {
  points: Float32Array;
  high: Float32Array;
  low: Float32Array;
}

export function dayBars(m: BuiltMarket, day: number): DayBars {
  const n = m.instruments.length;
  const out: DayBars = {
    points: new Float32Array(n * POINTS_PER_DAY),
    high: new Float32Array(n * BARS_PER_DAY),
    low: new Float32Array(n * BARS_PER_DAY),
  };
  m.instruments.forEach((inst, i) => {
    const closes = m.closes[i];
    const prevClose = closes?.[day] ?? 0;
    const close = closes?.[day + 1] ?? prevClose;
    const path = generateDayPath({
      seed: m.seed,
      ticker: inst.ticker,
      day,
      prevClose,
      close,
      annualVol: instrumentVol(m, i, day),
      jump: m.jumps[i]?.[day] ?? 0,
    });
    out.points.set(path.points, i * POINTS_PER_DAY);
    out.high.set(path.high, i * BARS_PER_DAY);
    out.low.set(path.low, i * BARS_PER_DAY);
  });
  return out;
}

/** Just the points of `dayBars`. */
export function dayPrices(m: BuiltMarket, day: number): Float32Array {
  return dayBars(m, day).points;
}
