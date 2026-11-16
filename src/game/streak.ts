/**
 * Days played in a row, by the device's local date. A day counts when the player plays at
 * least one in-game close or finishes a lesson. Missing a day only resets the counter.
 */

export interface Streak {
  count: number;
  best: number;
  /** Last day that counted, `YYYY-MM-DD`. */
  last: string | null;
}

/** The calendar day before a `YYYY-MM-DD` date. */
export function dayBefore(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) - 1));
  return t.toISOString().slice(0, 10);
}

export function markPlayed(s: Streak, date: string): Streak {
  if (s.last === date) return s;
  const count = s.last === dayBefore(date) ? s.count + 1 : 1;
  return { count, best: Math.max(s.best, count), last: date };
}

/** The streak as it stands today: still alive if the last day counted was today or yesterday. */
export function currentStreak(s: Streak, today: string): number {
  return s.last === today || s.last === dayBefore(today) ? s.count : 0;
}
