import { describe, expect, it } from 'vitest';
import {
  cleanWatchlist,
  DEFAULT_WATCHLIST,
  moveWatch,
  toggleWatch,
  WATCHLIST_MAX,
  watchlistFor,
} from './watchlist';

describe('watchlist', () => {
  it('adds at the end, removes, and stops at the maximum', () => {
    expect(toggleWatch(['AAPL'], 'KO')).toEqual(['AAPL', 'KO']);
    expect(toggleWatch(['AAPL', 'KO'], 'AAPL')).toEqual(['KO']);
    const full = Array.from({ length: WATCHLIST_MAX }, (_, i) => `T${i}`);
    expect(toggleWatch(full, 'KO')).toEqual(full);
    expect(toggleWatch(full, 'T3')).toHaveLength(WATCHLIST_MAX - 1);
  });

  it('moves names one place and leaves the ends alone', () => {
    expect(moveWatch(['A', 'B', 'C'], 'B', -1)).toEqual(['B', 'A', 'C']);
    expect(moveWatch(['A', 'B', 'C'], 'B', 1)).toEqual(['A', 'C', 'B']);
    expect(moveWatch(['A', 'B', 'C'], 'A', -1)).toEqual(['A', 'B', 'C']);
    expect(moveWatch(['A', 'B', 'C'], 'C', 1)).toEqual(['A', 'B', 'C']);
    expect(moveWatch(['A'], 'Z', 1)).toEqual(['A']);
  });

  it('cleans saved lists', () => {
    expect(cleanWatchlist(undefined)).toBeNull();
    expect(cleanWatchlist('AAPL')).toBeNull();
    expect(cleanWatchlist(['AAPL', 'AAPL', 3, 'bad ticker', 'BF.B', ''])).toEqual(['AAPL', 'BF.B']);
    expect(cleanWatchlist(Array.from({ length: 30 }, (_, i) => `T${i}`))).toHaveLength(
      WATCHLIST_MAX,
    );
    expect(cleanWatchlist([])).toEqual([]);
  });

  it('swaps names a scenario does not list for stand-ins, one for one', () => {
    const in1998 = new Set(['AAPL', 'MSFT', 'AMZN', 'JPM', 'KO', 'XOM', 'JNJ', 'WMT', 'PG']);
    const w = watchlistFor(DEFAULT_WATCHLIST, in1998);
    expect(w.shown).toEqual(['AAPL', 'MSFT', 'AMZN', 'JPM', 'KO']);
    expect(w.hidden).toEqual(['NVDA', 'GOOGL', 'TSLA']);
    expect(w.standIns).toEqual(['XOM', 'JNJ', 'WMT']);
    // Never a name already on the list, and none when everything is listed.
    expect(watchlistFor(['XOM', 'TSLA'], in1998).standIns).toEqual(['JNJ']);
    expect(watchlistFor(['AAPL'], in1998).standIns).toEqual([]);
    expect(watchlistFor([], in1998)).toEqual({ shown: [], hidden: [], standIns: [] });
  });

  it('keeps stand-ins to a short list', () => {
    const listed = new Set(['XOM', 'JNJ', 'WMT', 'PG', 'GE', 'IBM', 'INTC', 'CSCO', 'ORCL', 'A']);
    const many = Array.from({ length: 12 }, (_, i) => `N${i}`);
    expect(watchlistFor(many, listed).standIns).toHaveLength(8);
  });
});
