import { describe, expect, it } from 'vitest';
import { UNIVERSE } from '../data/universe';
import { instrumentsFor } from '../engine/market';
import type { InstrumentInfo } from '../engine/protocol';
import { getScenario } from '../engine/scenarios';
import { DEFAULT_WATCHLIST, watchlistFor } from '../game/watchlist';
import { inSector, searchInstruments, topMovers } from './marketList';

const info = (id: string): InstrumentInfo[] => instrumentsFor(getScenario(id), UNIVERSE);

describe('market lists', () => {
  it('shows the default watchlist, with stand-ins in older scenarios', () => {
    const stocks = (id: string) =>
      new Set(
        info(id)
          .filter((i) => i.kind === 'stock')
          .map((i) => i.ticker),
      );
    expect(watchlistFor(DEFAULT_WATCHLIST, stocks('covid-2020')).shown).toEqual([
      ...DEFAULT_WATCHLIST,
    ]);
    const dotCom = watchlistFor(DEFAULT_WATCHLIST, stocks('dot-com'));
    expect(dotCom.hidden).toEqual(['NVDA', 'GOOGL', 'TSLA']);
    expect(dotCom.standIns).toEqual(['XOM', 'JNJ', 'WMT']);
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
