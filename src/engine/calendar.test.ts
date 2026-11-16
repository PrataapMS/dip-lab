import { describe, expect, it } from 'vitest';
import {
  civilFromDays,
  daysFromCivil,
  fromDayNumber,
  isTradingDay,
  nextTradingDay,
  toDayNumber,
  tradingDaysBetween,
  tradingDaysFrom,
  weekday,
} from './calendar';
import {
  advanceClock,
  createClock,
  isFinished,
  setPlaying,
  speedOf,
  SPEEDS,
  stepClock,
  stepDay,
  STEPS_PER_DAY,
} from './clock';

describe('calendar', () => {
  it('converts dates to day numbers and back', () => {
    expect(daysFromCivil(1970, 1, 1)).toBe(0);
    expect(toDayNumber('2000-03-01')).toBe(11017);
    for (const iso of ['1985-09-27', '2000-02-29', '2024-12-31', '2026-11-16']) {
      expect(fromDayNumber(toDayNumber(iso))).toBe(iso);
    }
    expect(civilFromDays(-1)).toEqual([1969, 12, 31]);
    expect(weekday(toDayNumber('2026-11-16'))).toBe(1); // Monday
  });

  it('matches known NYSE trading-day counts per year', () => {
    const count = (y: number) => tradingDaysBetween(`${y}-01-01`, `${y}-12-31`).length;
    expect(count(2001)).toBe(248);
    expect(count(2008)).toBe(253);
    expect(count(2012)).toBe(250);
    expect(count(2019)).toBe(252);
    expect(count(2020)).toBe(253);
    expect(count(2021)).toBe(252);
    expect(count(2022)).toBe(251);
    expect(count(2023)).toBe(250);
    expect(count(2024)).toBe(252);
  });

  it('closes on holidays and their observed days', () => {
    expect(isTradingDay('2024-03-29')).toBe(false); // Good Friday
    expect(isTradingDay('2022-12-26')).toBe(false); // Christmas observed
    expect(isTradingDay('2021-12-31')).toBe(true); // Saturday New Year is not made up
    expect(isTradingDay('2023-06-19')).toBe(false); // Juneteenth
    expect(isTradingDay('2021-06-18')).toBe(true); // before Juneteenth was a market holiday
    expect(isTradingDay('2001-09-12')).toBe(false);
    expect(isTradingDay('2024-11-28')).toBe(false); // Thanksgiving
    expect(isTradingDay('2024-11-29')).toBe(true); // early close, still a trading day
    expect(isTradingDay('2026-11-14')).toBe(false); // Saturday
  });

  it('finds the next trading day and runs of days', () => {
    expect(nextTradingDay('2024-03-28')).toBe('2024-04-01');
    expect(tradingDaysFrom('2024-12-24', 3)).toEqual(['2024-12-24', '2024-12-26', '2024-12-27']);
    // COVID crash: 2020-02-20 to the 2020-03-23 low is 23 trading days.
    expect(tradingDaysBetween('2020-02-20', '2020-03-23')).toHaveLength(23);
  });
});

describe('clock', () => {
  it('steps through the bars of a day, then to the next open', () => {
    let c = createClock(2);
    for (let i = 0; i < 78; i++) c = stepClock(c);
    expect([c.day, c.bar]).toEqual([0, 78]);
    c = stepClock(c);
    expect([c.day, c.bar]).toEqual([1, 0]);
  });

  it('advances by real time at the chosen day length', () => {
    let c = setPlaying(createClock(10, SPEEDS['8x']), true);
    c = advanceClock(c, 7_500);
    expect([c.day, c.bar]).toEqual([1, 0]);
    const stepMs = 7_500 / STEPS_PER_DAY;
    c = advanceClock(c, stepMs * 2.5);
    expect(c.bar).toBe(2);
    expect(c.carry).toBeCloseTo(stepMs / 2, 6);
  });

  it('maps speed chips to day lengths, 2x by default', () => {
    expect(SPEEDS).toEqual({ '1x': 60_000, '2x': 30_000, '4x': 15_000, '8x': 7_500 });
    expect(createClock(5).dayLengthMs).toBe(30_000);
    expect(speedOf(15_000)).toBe('4x');
    expect(speedOf(300_000)).toBeNull();
  });

  it('does not move while paused', () => {
    const c = createClock(10);
    expect(advanceClock(c, 60_000)).toBe(c);
  });

  it('stops at the final close', () => {
    let c = setPlaying(createClock(2, SPEEDS['8x']), true);
    c = advanceClock(c, 60_000);
    expect(isFinished(c)).toBe(true);
    expect(c.playing).toBe(false);
    expect([c.day, c.bar]).toEqual([1, 78]);
    expect(setPlaying(c, true).playing).toBe(false);
  });

  it('steps a day to the close, then to the next close', () => {
    let c = stepDay(createClock(3));
    expect([c.day, c.bar]).toEqual([0, 78]);
    c = stepDay(c);
    expect([c.day, c.bar]).toEqual([1, 78]);
  });
});
