import { isSector, SECTORS } from '../engine/factors';
import { etfParams, type EtfTracks, type Instrument } from '../engine/instruments';
import raw from './universe.json';

/**
 * The tradable universe: ~550 US stocks plus index and sector ETFs. Names and tickers
 * identify real companies; beta, volatility and yield are approximate game parameters,
 * not market data. Prices are always simulated.
 */
interface RawStock {
  ticker: string;
  name: string;
  sector: string;
  beta: number;
  vol: number;
  divYield: number;
  ipoYear: number;
  delistYear?: number;
}

interface RawEtf {
  ticker: string;
  name: string;
  tracks: string;
  ipoYear: number;
}

const TRACKS = new Set<string>(['market', 'nasdaq', 'dow', 'smallcap', ...SECTORS]);

function check(ok: boolean, message: string): void {
  if (!ok) throw new Error(`universe.json: ${message}`);
}

export function parseUniverse(data: { stocks: RawStock[]; etfs: RawEtf[] }): Instrument[] {
  const seen = new Set<string>();
  const out: Instrument[] = [];
  for (const s of data.stocks) {
    check(!seen.has(s.ticker), `duplicate ticker ${s.ticker}`);
    check(isSector(s.sector), `${s.ticker} has unknown sector ${s.sector}`);
    check(s.beta > 0 && s.beta < 4, `${s.ticker} beta out of range`);
    check(s.vol > 0.05 && s.vol < 2, `${s.ticker} vol out of range`);
    check(s.divYield >= 0 && s.divYield < 0.2, `${s.ticker} divYield out of range`);
    check(
      s.delistYear === undefined || s.delistYear > s.ipoYear,
      `${s.ticker} delisted before it listed`,
    );
    seen.add(s.ticker);
    out.push({
      ticker: s.ticker,
      name: s.name,
      kind: 'stock',
      sector: isSector(s.sector) ? s.sector : null,
      beta: s.beta,
      vol: s.vol,
      divYield: s.divYield,
      ipoYear: s.ipoYear,
      ...(s.delistYear !== undefined ? { delistYear: s.delistYear } : {}),
    });
  }
  for (const e of data.etfs) {
    check(!seen.has(e.ticker), `duplicate ticker ${e.ticker}`);
    check(TRACKS.has(e.tracks), `${e.ticker} tracks unknown ${e.tracks}`);
    seen.add(e.ticker);
    out.push({
      ...etfParams(e.ticker, e.tracks as EtfTracks),
      name: e.name,
      kind: 'etf',
      ipoYear: e.ipoYear,
    });
  }
  return out;
}

export const UNIVERSE: readonly Instrument[] = parseUniverse(raw);
