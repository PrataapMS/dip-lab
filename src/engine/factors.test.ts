import { describe, expect, it } from 'vitest';
import {
  generateStockPath,
  idioVolFor,
  MIN_IDIO_VOL,
  sectorShocks,
  type StockParams,
} from './factors';
import { generateMarketDays } from './regimes';

const DAYS = 5000;
const market = generateMarketDays({
  seed: 1,
  days: DAYS,
  regimes: Array.from({ length: DAYS }, () => 'calm' as const),
});

function logReturns(closes: Float64Array): number[] {
  const out: number[] = [];
  for (let i = 1; i < closes.length; i++)
    out.push(Math.log((closes[i] ?? 1) / (closes[i - 1] ?? 1)));
  return out;
}

function corr(a: readonly number[], b: readonly number[]): number {
  const n = a.length;
  const ma = a.reduce((s, x) => s + x, 0) / n;
  const mb = b.reduce((s, x) => s + x, 0) / n;
  let sab = 0;
  let saa = 0;
  let sbb = 0;
  for (let i = 0; i < n; i++) {
    const da = (a[i] ?? 0) - ma;
    const db = (b[i] ?? 0) - mb;
    sab += da * db;
    saa += da * da;
    sbb += db * db;
  }
  return sab / Math.sqrt(saa * sbb);
}

const tech = sectorShocks(1, 'Information Technology', market.vols);
const energy = sectorShocks(1, 'Energy', market.vols);
const stock = (ticker: string, extra: Partial<StockParams> = {}): StockParams => ({
  ticker,
  beta: 1.1,
  vol: 0.3,
  sector: 'Information Technology',
  jumpsPerYear: 0,
  ...extra,
});

describe('factors', () => {
  it('is deterministic per seed and ticker', () => {
    const a = generateStockPath(1, stock('AAA'), 50, market, tech);
    const b = generateStockPath(1, stock('AAA'), 50, market, tech);
    const c = generateStockPath(1, stock('BBB'), 50, market, tech);
    expect(a.closes).toEqual(b.closes);
    expect(a.closes).not.toEqual(c.closes);
    expect(sectorShocks(1, 'Energy', market.vols)).toEqual(energy);
  });

  it('starts at the start price and stays positive', () => {
    const { closes } = generateStockPath(2, stock('AAA'), 42, market, tech);
    expect(closes[0]).toBe(42);
    expect(closes.every((p) => p > 0)).toBe(true);
  });

  it('splits volatility into market, sector and own parts', () => {
    expect(idioVolFor(stock('AAA'))).toBeCloseTo(Math.sqrt(0.09 - 1.21 * 0.0256 - 0.01), 10);
    expect(idioVolFor(stock('LOW', { vol: 0.1, beta: 1 }))).toBe(MIN_IDIO_VOL);
    expect(idioVolFor(stock('ETF', { idioVol: 0.01 }))).toBe(0.01);
  });

  it('realises roughly its profile volatility in normal markets', () => {
    const r = logReturns(generateStockPath(3, stock('AAA'), 100, market, tech).closes);
    const mean = r.reduce((s, x) => s + x, 0) / r.length;
    const sd = Math.sqrt(r.reduce((s, x) => s + (x - mean) ** 2, 0) / r.length) * Math.sqrt(252);
    // Calm regime runs below reference vol, so realised vol lands a little under 0.3.
    expect(sd).toBeGreaterThan(0.2);
    expect(sd).toBeLessThan(0.34);
  });

  it('makes stocks in the same sector move together more than across sectors', () => {
    const a = logReturns(generateStockPath(4, stock('AAA'), 100, market, tech).closes);
    const b = logReturns(generateStockPath(4, stock('BBB'), 100, market, tech).closes);
    const c = logReturns(
      generateStockPath(4, stock('CCC', { sector: 'Energy' }), 100, market, energy).closes,
    );
    expect(corr(a, b)).toBeGreaterThan(corr(a, c) + 0.03);
    expect(corr(a, market.returns)).toBeGreaterThan(0.3);
  });

  it('adds news jumps at about the expected rate', () => {
    const { jumps } = generateStockPath(5, stock('JMP', { jumpsPerYear: 6 }), 100, market, tech);
    const count = jumps.filter((j) => j !== 0).length;
    const expected = (6 * DAYS) / 252;
    expect(count).toBeGreaterThan(expected * 0.7);
    expect(count).toBeLessThan(expected * 1.3);
  });
});
