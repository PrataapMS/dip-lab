import { BARS_PER_DAY } from './intraday';

/**
 * Simulated market clock. Pure: the caller feeds real elapsed milliseconds in, the clock
 * says where the market is. A position is (day, bar): bar 0 is the open, bar 78 the close.
 * Moving from one day's close to the next day's open takes one step, like a bar.
 */
export const DAY_LENGTHS = {
  '5s': 5_000,
  '15s': 15_000,
  '30s': 30_000,
  '1m': 60_000,
  '5m': 300_000,
  /** Real market time: 6.5 hours. */
  real: 23_400_000,
} as const;
export type DayLength = keyof typeof DAY_LENGTHS;
export const DEFAULT_DAY_LENGTH: DayLength = '30s';

/** Steps per trading day: 78 bars plus the overnight move to the next open. */
export const STEPS_PER_DAY = BARS_PER_DAY + 1;

export interface ClockState {
  day: number;
  bar: number;
  totalDays: number;
  dayLengthMs: number;
  playing: boolean;
  /** Milliseconds banked toward the next step. */
  carry: number;
}

export function createClock(totalDays: number, dayLengthMs: number = DAY_LENGTHS[DEFAULT_DAY_LENGTH]): ClockState {
  return { day: 0, bar: 0, totalDays, dayLengthMs, playing: false, carry: 0 };
}

export function isFinished(c: ClockState): boolean {
  return c.day >= c.totalDays - 1 && c.bar >= BARS_PER_DAY;
}

/** Move one step forward. Returns the same state when the run is over. */
export function stepClock(c: ClockState): ClockState {
  if (isFinished(c)) return { ...c, playing: false };
  if (c.bar < BARS_PER_DAY) return { ...c, bar: c.bar + 1 };
  return { ...c, day: c.day + 1, bar: 0 };
}

/** Advance by real elapsed time while playing. */
export function advanceClock(c: ClockState, elapsedMs: number): ClockState {
  if (!c.playing || elapsedMs <= 0) return c;
  const stepMs = c.dayLengthMs / STEPS_PER_DAY;
  const banked = c.carry + elapsedMs;
  // Small epsilon so float rounding never drops a step that is due exactly now.
  const steps = Math.floor(banked / stepMs + 1e-9);
  let next = c;
  for (let i = 0; i < steps; i++) {
    next = stepClock(next);
    if (isFinished(next)) return { ...next, playing: false, carry: 0 };
  }
  return { ...next, carry: Math.max(0, banked - steps * stepMs) };
}

/** Jump to the close of the current day, or to the next day's close if already there. */
export function stepDay(c: ClockState): ClockState {
  if (isFinished(c)) return { ...c, playing: false };
  if (c.bar < BARS_PER_DAY) return { ...c, bar: BARS_PER_DAY, carry: 0 };
  return { ...c, day: c.day + 1, bar: BARS_PER_DAY, carry: 0 };
}

export function setPlaying(c: ClockState, playing: boolean): ClockState {
  return { ...c, playing: playing && !isFinished(c) };
}

export function setDayLength(c: ClockState, dayLengthMs: number): ClockState {
  return { ...c, dayLengthMs, carry: 0 };
}
