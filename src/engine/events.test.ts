import { describe, expect, it } from 'vitest';
import { UNIVERSE } from '../data/universe';
import { earningsDays, earningsSlot } from './events';
import { eventText } from './headlines';
import { buildMarket, eventsOn } from './market';
import { customScenario, getScenario, SCENARIOS } from './scenarios';

const rate = buildMarket(getScenario('rate-shock-2022'), 11, UNIVERSE);
const stocks = rate.instruments.filter((i) => i.kind === 'stock');

describe('events', () => {
  it('are identical for the same seed, wording included', () => {
    const again = buildMarket(getScenario('rate-shock-2022'), 11, UNIVERSE);
    expect(again.events).toEqual(rate.events);
    expect(again.events.map(eventText)).toEqual(rate.events.map(eventText));
    const other = buildMarket(getScenario('rate-shock-2022'), 12, UNIVERSE);
    expect(other.events.map(eventText)).not.toEqual(rate.events.map(eventText));
  });

  it('gives every stock one report per quarter, inside the reporting weeks', () => {
    for (const inst of stocks) {
      const reports = rate.events.filter((e) => e.kind === 'earnings' && e.ticker === inst.ticker);
      expect(reports).toHaveLength(4);
      for (const r of reports) {
        // Reports fall in the first half of each quarter, a few weeks after the last one ended.
        const month = Number(rate.dates[r.day]?.slice(5, 7));
        expect([1, 2, 4, 5, 7, 8, 10, 11]).toContain(month);
      }
    }
    expect(
      rate.events.some(
        (e) =>
          e.kind === 'earnings' &&
          rate.instruments.find((i) => i.ticker === e.ticker)?.kind === 'etf',
      ),
    ).toBe(false);
  });

  it('keeps a company in the same slot whatever the seed', () => {
    expect(earningsSlot('AAPL')).toBe(earningsSlot('AAPL'));
    const days = earningsDays(rate.dates, 'AAPL');
    const other = buildMarket(getScenario('rate-shock-2022'), 99, UNIVERSE);
    expect(
      other.events.filter((e) => e.kind === 'earnings' && e.ticker === 'AAPL').map((e) => e.day),
    ).toEqual(days);
  });

  it('beats about 70% of the time, and some beats still fall', () => {
    const reports = rate.events.filter((e) => e.kind === 'earnings');
    const beats = reports.filter((e) => e.result === 'beat');
    expect(beats.length / reports.length).toBeGreaterThan(0.65);
    expect(beats.length / reports.length).toBeLessThan(0.75);
    expect(beats.some((e) => e.move < 0)).toBe(true);
    expect(reports.filter((e) => e.result === 'miss').some((e) => e.move > 0)).toBe(true);
  });

  it('puts each earnings and news move into the overnight gap', () => {
    for (const e of rate.events) {
      if (e.kind === 'headline' || !e.ticker) continue;
      const i = rate.instruments.findIndex((x) => x.ticker === e.ticker);
      const jump = rate.jumps[i]?.[e.day] ?? 0;
      expect(Math.abs(jump)).toBeGreaterThan(0);
    }
    const aapl = rate.instruments.findIndex((x) => x.ticker === 'AAPL');
    const earnings = rate.events.find((e) => e.kind === 'earnings' && e.ticker === 'AAPL');
    const news = rate.events.filter(
      (e) => e.kind === 'news' && e.ticker === 'AAPL' && e.day === earnings?.day,
    );
    expect(rate.jumps[aapl]?.[earnings?.day ?? 0]).toBeCloseTo(
      (earnings?.move ?? 0) + (news[0]?.move ?? 0),
      5,
    );
  });

  it('places scenario headlines on waypoint days, matching the move', () => {
    for (const def of SCENARIOS) {
      const m = buildMarket(def, 3, UNIVERSE);
      const headlines = m.events.filter((e) => e.kind === 'headline');
      expect(headlines.length).toBe(def.headlines?.length);
      expect(headlines[0]?.day).toBe(0);
      expect(headlines[0]?.bar).toBe(0);
      const marks = new Map<number, number>([[0, 0]]);
      for (const p of def.market)
        marks.set(
          m.dates.findLastIndex((d) => d <= p.date),
          p.ret,
        );
      let prev = 0;
      for (const h of def.headlines ?? []) {
        if (h.at === 'open' || h.ticker) continue;
        const day = m.dates.findLastIndex((d) => d <= h.date);
        const ret = marks.get(day);
        expect(ret, `${def.id} ${h.date}`).toBeDefined();
        expect(h.tone, `${def.id} ${h.date}`).toBe((ret ?? 0) > prev ? 'up' : 'down');
        prev = ret ?? 0;
      }
    }
  });

  it('lists a day of events in order', () => {
    const day = rate.events.find((e) => e.kind === 'earnings')?.day ?? 0;
    const list = eventsOn(rate, day);
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((e) => e.day === day)).toBe(true);
    expect(rate.eventIndex).toHaveLength(rate.dates.length + 1);
  });

  it('turns news and earnings off for a quiet custom run', () => {
    const quiet = buildMarket(
      customScenario({ start: '2019-01-02', days: 120, news: 'off' }),
      1,
      UNIVERSE,
    );
    expect(quiet.events.map((e) => e.kind)).toEqual(['headline']);
  });

  it('writes plain headlines with a signed move', () => {
    const e = rate.events.find((x) => x.kind === 'earnings' && x.move < 0);
    if (!e) throw new Error('no falling report');
    expect(eventText(e)).toMatch(/^[A-Z.]+ .*shares −\d+\.\d%$/);
  });
});
