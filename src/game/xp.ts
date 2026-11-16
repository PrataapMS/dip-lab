/**
 * XP for a finished run: 100 × difficulty (what the scenario card shows) × a grade factor,
 * scaled by the share of days played when a run is ended early. Replays of the same market
 * pay only what beats the best so far on it, so improving pays and farming doesn't.
 */

export const GRADE_FACTOR: Readonly<Record<string, number>> = {
  A: 2,
  'A-': 1.8,
  'B+': 1.6,
  B: 1.4,
  'B-': 1.2,
  'C+': 1,
  C: 0.9,
  'C-': 0.8,
  D: 0.6,
  F: 0.4,
};

/** Runs shorter than this many trading days earn no run XP. */
export const MIN_DAYS_FOR_XP = 10;
/** Bonus the first time a scenario is finished. */
export const FIRST_FINISH_XP = 100;

export const XP = {
  badge: 50,
  lesson: 25,
} as const;

/** The "+N XP" on a scenario card. */
export function baseRunXp(difficulty: number): number {
  return 100 * Math.max(1, Math.round(difficulty));
}

export interface RunXpInput {
  difficulty: number;
  letter: string;
  /** Trading days played and in the scenario. */
  days: number;
  totalDays: number;
  /** Played to the last day (or a target), not ended early or bust. */
  complete: boolean;
}

/** XP a run is worth before the best-on-this-market rule. */
export function runXp(r: RunXpInput): number {
  if (r.days < MIN_DAYS_FOR_XP) return 0;
  const share = r.complete ? 1 : Math.min(1, r.days / Math.max(1, r.totalDays));
  return Math.round(baseRunXp(r.difficulty) * (GRADE_FACTOR[r.letter] ?? 0) * share);
}

/** What a replay pays: only the part above the best earned on the same market. */
export function replayAward(worth: number, best: number): number {
  return Math.max(0, worth - best);
}
