import { describe, expect, it } from 'vitest';
import { UNIVERSE } from '../data/universe';
import { buildMarket } from './market';
import { BIG_MOVE, MAX_OTHER_PER_DAY, selectNews, tickerNews, upcomingFor } from './news';
import { getScenario } from './scenarios';

const m = buildMarket(getScenario('earnings-season'), 4, UNIVERSE);

describe('news feed', () => {
  it('keeps headlines, followed tickers and a few big moves per day', () => {
    const items = selectNews(m.events, (t) => t === 'AAPL', (t) => t === 'AAPL');
    expect(items.filter((n) => n.kind === 'headline')).toHaveLength(m.events.filter((e) => e.kind === 'headline').length);
    expect(items.filter((n) => n.ticker === 'AAPL')).toHaveLength(m.events.filter((e) => e.ticker === 'AAPL').length);
    expect(items.filter((n) => n.ticker === 'AAPL').every((n) => n.mine)).toBe(true);
    const others = items.filter((n) => n.kind !== 'headline' && n.ticker !== 'AAPL');
    const perDay = new Map<number, number>();
    for (const n of others) perDay.set(n.day, (perDay.get(n.day) ?? 0) + 1);
    expect(Math.max(...perDay.values())).toBeLessThanOrEqual(MAX_OTHER_PER_DAY);
    expect(others.length).toBeGreaterThan(0);
    const big = new Set(m.events.filter((e) => Math.abs(e.move) >= BIG_MOVE).map((e) => `${e.day}:${e.ticker}`));
    expect(others.every((n) => big.has(`${n.day}:${n.ticker}`))).toBe(true);
  });

  it('lists a ticker’s past news and its next report', () => {
    const report = m.events.find((e) => e.kind === 'earnings' && e.ticker === 'MSFT');
    if (!report) throw new Error('MSFT never reports');
    expect(upcomingFor(m, 'MSFT', report.day - 1).earnings).toBe(report.day);
    expect(upcomingFor(m, 'MSFT', report.day).earnings).toBeNull();
    expect(tickerNews(m, 'MSFT', report.day - 1, 78).some((n) => n.kind === 'earnings')).toBe(false);
    expect(tickerNews(m, 'MSFT', report.day, 0)[0]?.kind).toBe(m.events.filter((e) => e.ticker === 'MSFT' && e.day === report.day)[0]?.kind);
  });
});
