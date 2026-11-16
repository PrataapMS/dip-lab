import { describe, expect, it } from 'vitest';
import { UNIVERSE } from '../data/universe';
import { instrumentsFor } from '../engine/market';
import type { InstrumentInfo } from '../engine/protocol';
import { getScenario } from '../engine/scenarios';
import { defaultWatchlist, inSector, searchInstruments, topMovers } from './marketList';

const info = (id: string): InstrumentInfo[] => instrumentsFor(getScenario(id), UNIVERSE);

describe('market lists', () => {
  it('uses the default watchlist and tops it up in older scenarios', () => {
    expect(defaultWatchlist(info('covid-2020'))).toEqual([
      'AAPL',
      'MSFT',
      'NVDA',
      'AMZN',
      'GOOGL',
      'TSLA',
      'JPM',
      'KO',
    ]);
    const dotCom = defaultWatchlist(info('dot-com'));
    expect(dotCom).toHaveLength(8);
    expect(dotCom).not.toContain('GOOGL');
    expect(dotCom).not.toContain('TSLA');
    expect(dotCom.slice(-2)).toEqual(['JNJ', 'WMT']);
  });

  it('searches tickers first, then names', () => {
    const all = info('covid-2020');
    const r = searchInstruments(all, 'app').map((i) => i.ticker);
    expect(r).toContain('AAPL');
    expect(searchInstruments(all, 'KO')[0]?.ticker).toBe('KO');
    expect(searchInstruments(all, 'coca').map((i) => i.ticker)).toContain('KO');
    expect(searchInstruments(all, '  ')).toEqual([]);
  });

  it('filters by sector chip and finds movers', () => {
    const all = info('covid-2020');
    expect(all.filter((i) => inSector(i, 'etf')).every((i) => i.kind === 'etf')).toBe(true);
    const prices = all.map((_, i) => 100 + (i % 7));
    const prev = all.map(() => 100);
    const m = topMovers(all, prices, prev, 3);
    expect(m.up).toHaveLength(3);
    expect(m.down).toHaveLength(3);
  });
});
