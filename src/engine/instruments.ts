import type { Sector, StockParams } from './factors';

/** Anything the player can trade: a stock or an ETF, with its game parameters. */
export interface Instrument extends StockParams {
  name: string;
  kind: 'stock' | 'etf';
  /** Approximate annual dividend yield. */
  divYield: number;
  /** First year it traded; it is hidden in scenarios that start earlier. */
  ipoYear: number;
}

/** What an ETF follows. */
export type EtfTracks = 'market' | 'nasdaq' | 'dow' | 'smallcap' | Sector;

/** Typical market beta of each sector's ETF. */
const SECTOR_ETF_BETA: Record<Sector, number> = {
  'Information Technology': 1.15,
  'Health Care': 0.8,
  Financials: 1.1,
  'Consumer Discretionary': 1.15,
  'Communication Services': 1.0,
  Industrials: 1.05,
  'Consumer Staples': 0.6,
  Energy: 1.0,
  Utilities: 0.5,
  'Real Estate': 0.9,
  Materials: 1.05,
};

/** Factor exposures for an ETF, so it moves like the basket it holds. */
export function etfParams(ticker: string, tracks: EtfTracks): StockParams & { divYield: number } {
  const base = { ticker, jumpsPerYear: 0 };
  switch (tracks) {
    case 'market':
      return { ...base, beta: 1, vol: 0.16, sector: null, idioVol: 0.003, divYield: 0.014 };
    case 'nasdaq':
      return {
        ...base,
        beta: 1.15,
        vol: 0.22,
        sector: 'Information Technology',
        sectorLoading: 0.6,
        idioVol: 0.03,
        divYield: 0.006,
      };
    case 'dow':
      return { ...base, beta: 0.95, vol: 0.16, sector: null, idioVol: 0.03, divYield: 0.017 };
    case 'smallcap':
      return { ...base, beta: 1.2, vol: 0.22, sector: null, idioVol: 0.07, divYield: 0.012 };
    default:
      return {
        ...base,
        beta: SECTOR_ETF_BETA[tracks],
        vol: 0.2,
        sector: tracks,
        sectorLoading: 1,
        idioVol: 0.02,
        divYield: 0.02,
      };
  }
}
