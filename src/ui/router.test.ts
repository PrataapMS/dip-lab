import { describe, expect, it } from 'vitest';
import {
  formatRoute,
  HOME,
  isBelow,
  parseRoute,
  popRoute,
  pushRoute,
  replaceTop,
  type Route,
  type Stack,
  stackFor,
  topOf,
} from './router';

describe('router', () => {
  it('round-trips every route through the hash', () => {
    const routes: Route[] = [
      { name: 'home' },
      { name: 'market' },
      { name: 'portfolio' },
      { name: 'learn' },
      { name: 'learn', lesson: 'orders' },
      { name: 'debrief' },
      { name: 'badges' },
      { name: 'new' },
      { name: 'settings' },
      { name: 'stock', ticker: 'BRK.B' },
    ];
    for (const r of routes) expect(parseRoute(formatRoute(r))).toEqual(r);
  });

  it('falls back to home for anything unknown', () => {
    expect(parseRoute('')).toEqual({ name: 'home' });
    expect(parseRoute('#/nope')).toEqual({ name: 'home' });
    expect(parseRoute('#/stock/')).toEqual({ name: 'home' });
    expect(parseRoute('#/stock/nvda')).toEqual({ name: 'stock', ticker: 'NVDA' });
  });

  describe('back stack', () => {
    const names = (s: Stack) => s.map(formatRoute);
    const market: Route = { name: 'market' };
    const portfolio: Route = { name: 'portfolio' };
    const nvda: Route = { name: 'stock', ticker: 'NVDA' };

    it('Back from a tab returns to the tab before it, then Home, then exits', () => {
      let s: Stack = [HOME];
      s = pushRoute(s, market);
      s = pushRoute(s, portfolio);
      expect(names(s)).toEqual(['#/home', '#/market', '#/portfolio']);
      s = popRoute(s) as Stack;
      expect(topOf(s)).toEqual(market);
      s = popRoute(s) as Stack;
      expect(names(s)).toEqual(['#/home']);
      expect(popRoute(s)).toBeNull();
    });

    it('never bounces: a screen already in the stack pops back to it', () => {
      let s: Stack = [HOME];
      for (const r of [market, portfolio, market, portfolio, market]) s = pushRoute(s, r);
      expect(names(s)).toEqual(['#/home', '#/market']);
      s = pushRoute(pushRoute(s, nvda), market);
      expect(names(s)).toEqual(['#/home', '#/market']);
      expect(names(pushRoute(s, HOME))).toEqual(['#/home']);
    });

    it('sub-screens pop back to whatever opened them', () => {
      const s = pushRoute(pushRoute([HOME], portfolio), nvda);
      expect(topOf(popRoute(s) as Stack)).toEqual(portfolio);
      const l = pushRoute(pushRoute([HOME], { name: 'learn' }), {
        name: 'learn',
        lesson: 'orders',
      });
      expect(names(popRoute(l) as Stack)).toEqual(['#/home', '#/learn']);
    });

    it("a screen opened without a tap takes the top screen's place, keeping Home", () => {
      const debrief: Route = { name: 'debrief' };
      expect(names(replaceTop([HOME, market], debrief))).toEqual(['#/home', '#/debrief']);
      expect(names(replaceTop([HOME], debrief))).toEqual(['#/home', '#/debrief']);
    });

    it('knows when one stack is another with screens taken off', () => {
      expect(isBelow([HOME, market], [HOME, market, nvda])).toBe(true);
      expect(isBelow([HOME, portfolio], [HOME, market, nvda])).toBe(false);
      expect(isBelow([HOME, market], [HOME, market])).toBe(false);
    });

    it('rebuilds a sensible stack for a screen opened directly', () => {
      expect(names(stackFor(nvda))).toEqual(['#/home', '#/market', '#/stock/NVDA']);
      expect(names(stackFor({ name: 'settings' }))).toEqual(['#/home', '#/settings']);
      expect(names(stackFor(HOME))).toEqual(['#/home']);
    });
  });
});
