import { describe, expect, it } from 'vitest';
import {
  formatRoute,
  HOME,
  parseRoute,
  popRoute,
  pushRoute,
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
    const nvda: Route = { name: 'stock', ticker: 'NVDA' };

    it('tabs sit straight on Home, so Back from any tab goes Home and then exits', () => {
      let s: Stack = [HOME];
      s = pushRoute(s, market);
      s = pushRoute(s, { name: 'portfolio' });
      s = pushRoute(s, { name: 'learn' });
      expect(names(s)).toEqual(['#/home', '#/learn']);
      s = popRoute(s) as Stack;
      expect(names(s)).toEqual(['#/home']);
      expect(popRoute(s)).toBeNull();
    });

    it('sub-screens pop back to whatever opened them', () => {
      let s = pushRoute(pushRoute([HOME], { name: 'portfolio' }), nvda);
      expect(topOf(popRoute(s) as Stack)).toEqual({ name: 'portfolio' });
      s = pushRoute(pushRoute([HOME], { name: 'learn' }), { name: 'learn', lesson: 'orders' });
      expect(names(popRoute(s) as Stack)).toEqual(['#/home', '#/learn']);
    });

    it('opening a screen already in the stack pops back to it', () => {
      const s = pushRoute(pushRoute(pushRoute([HOME], market), nvda), market);
      expect(names(s)).toEqual(['#/home', '#/market']);
      expect(names(pushRoute(s, HOME))).toEqual(['#/home']);
    });

    it('the debrief goes back to Home, not to the finished market', () => {
      expect(names(pushRoute(pushRoute([HOME], market), { name: 'debrief' }))).toEqual([
        '#/home',
        '#/debrief',
      ]);
    });

    it('stays short and keeps Home at the bottom', () => {
      let s: Stack = [HOME, market];
      for (const t of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N'])
        s = pushRoute(s, { name: 'stock', ticker: t });
      expect(s.length).toBe(12);
      expect(s[0]).toEqual(HOME);
      expect(topOf(s)).toEqual({ name: 'stock', ticker: 'N' });
    });

    it('rebuilds a sensible stack for a screen opened directly', () => {
      expect(names(stackFor(nvda))).toEqual(['#/home', '#/market', '#/stock/NVDA']);
      expect(names(stackFor({ name: 'settings' }))).toEqual(['#/home', '#/settings']);
      expect(names(stackFor(HOME))).toEqual(['#/home']);
    });
  });
});
