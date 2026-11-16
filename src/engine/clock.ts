import { BARS_PER_DAY } from './intraday';

/**
 * Simulated market clock. Pure: the caller feeds real elapsed milliseconds in, the clock
 * says where the market is. A position is (day, bar): bar 0 is the open, bar 78 the close.
 * Moving from one day's close to the next day's open takes one step, like a bar.
 *
 * Speed chips set how long one trading day takes in real time (2x: a day every 30 s).
 */
export const SPEEDS = {
  '1x': 60_000,
  '2x': 30_000,
  '4x': 15_000,
  '8x': 7_500,
} as const;
export type Speed = keyof typeof SPEEDS;
export const DEFAULT_SPEED: Speed = '2x';
export const DEFAULT_DAY_LENGTH_MS: number = SPEEDS[DEFAULT_SPEED];

/** Slower day lengths for Settings. */
export const SLOW_DAY_LENGTHS = {
  '5m': 300_000,
  /** Real market time: 6.5 hours. */
  real: 23_400_000,
} as const;

/** The speed chip for a day length, or null if it is one of the slow settings. */
export function speedOf(dayLengthMs: number): Speed | null {
  return (Object.keys(SPEEDS) as Speed[]).find((k) => SPEEDS[k] === dayLengthMs) ?? null;
}

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

export function createClock(
  totalDays: number,
  dayLengthMs: number = DEFAULT_DAY_LENGTH_MS,
): ClockState {
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

/** How many whole steps are due after `elapsedMs` of real time, and the time left over. */
export function pendingSteps(c: ClockState, elapsedMs: number): { steps: number; carry: number } {
  if (!c.playing || elapsedMs <= 0) return { steps: 0, carry: c.carry };
  const stepMs = c.dayLengthMs / STEPS_PER_DAY;
  const banked = c.carry + elapsedMs;
  // Small epsilon so float rounding never drops a step that is due exactly now.
  const steps = Math.floor(banked / stepMs + 1e-9);
  return { steps, carry: Math.max(0, banked - steps * stepMs) };
}

/** Advance by real elapsed time while playing. */
export function advanceClock(c: ClockState, elapsedMs: number): ClockState {
  if (!c.playing || elapsedMs <= 0) return c;
  const { steps, carry } = pendingSteps(c, elapsedMs);
  let next = c;
  for (let i = 0; i < steps; i++) {
    next = stepClock(next);
    if (isFinished(next)) return { ...next, playing: false, carry: 0 };
  }
  return { ...next, carry };
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
