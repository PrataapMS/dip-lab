import { describe, expect, it } from 'vitest';
import { formatRoute, parseRoute, type Route } from './router';

describe('router', () => {
  it('round-trips every route through the hash', () => {
    const routes: Route[] = [{ name: 'home' }, { name: 'market' }, { name: 'portfolio' }, { name: 'learn' }, { name: 'learn', lesson: 'orders' }, { name: 'debrief' }, { name: 'badges' }, { name: 'new' }, { name: 'stock', ticker: 'BRK.B' }];
    for (const r of routes) expect(parseRoute(formatRoute(r))).toEqual(r);
  });

  it('falls back to home for anything unknown', () => {
    expect(parseRoute('')).toEqual({ name: 'home' });
    expect(parseRoute('#/nope')).toEqual({ name: 'home' });
    expect(parseRoute('#/stock/')).toEqual({ name: 'home' });
    expect(parseRoute('#/stock/nvda')).toEqual({ name: 'stock', ticker: 'NVDA' });
  });
});
