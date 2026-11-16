import { describe, expect, it } from 'vitest';
import { SECTORS } from '../engine/factors';
import { parseUniverse, UNIVERSE } from './universe';

describe('universe', () => {
  const stocks = UNIVERSE.filter((i) => i.kind === 'stock');
  const etfs = UNIVERSE.filter((i) => i.kind === 'etf');

  it('has ~550 stocks and the core ETFs', () => {
    expect(stocks.length).toBeGreaterThanOrEqual(540);
    expect(stocks.length).toBeLessThanOrEqual(560);
    for (const t of ['SPY', 'QQQ', 'DIA', 'IWM', 'XLK', 'XLF', 'XLE']) {
      expect(etfs.map((e) => e.ticker)).toContain(t);
    }
  });

  it('covers every sector', () => {
    for (const s of SECTORS)
      expect(stocks.filter((x) => x.sector === s).length).toBeGreaterThan(10);
  });

  it('has unique tickers and sane parameters', () => {
    expect(new Set(UNIVERSE.map((i) => i.ticker)).size).toBe(UNIVERSE.length);
    for (const i of UNIVERSE) {
      expect(Number.isInteger(i.ipoYear)).toBe(true);
      expect(i.ipoYear).toBeLessThanOrEqual(2026);
      expect(i.name.length).toBeGreaterThan(0);
      if (i.delistYear !== undefined) expect(i.delistYear).toBeGreaterThan(i.ipoYear);
    }
  });

  it('rejects bad rows', () => {
    const row = {
      ticker: 'X',
      name: 'X',
      sector: 'Energy',
      beta: 1,
      vol: 0.3,
      divYield: 0,
      ipoYear: 2000,
    };
    expect(() => parseUniverse({ stocks: [row, row], etfs: [] })).toThrow(/duplicate/);
    expect(() => parseUniverse({ stocks: [{ ...row, sector: 'Crypto' }], etfs: [] })).toThrow(
      /sector/,
    );
    expect(() =>
      parseUniverse({
        stocks: [],
        etfs: [{ ticker: 'Y', name: 'Y', tracks: 'moon', ipoYear: 2000 }],
      }),
    ).toThrow(/tracks/);
    expect(() => parseUniverse({ stocks: [{ ...row, delistYear: 1999 }], etfs: [] })).toThrow(
      /delisted/,
    );
  });
});
