import type { Activity } from '../engine/activity';
import type { Debrief } from '../engine/debrief';
import type { Progress } from './progress';

/**
 * 24 badges for habits and milestones. Each is a pure check on one activity and the player's
 * progress (already updated for that activity). Earned once. Rewards good process: nothing
 * here pays for trading more or for an all-in bet.
 */

export type BadgeGroup = 'basics' | 'process' | 'results' | 'advanced' | 'habits';

export interface BadgeCtx {
  /** Lessons in the Learn tab (Scholar needs them all). */
  lessonCount: number;
}

export interface BadgeDef {
  id: string;
  name: string;
  /** How to earn it, in plain words. */
  how: string;
  group: BadgeGroup;
  check: (a: Activity, p: Progress, ctx: BadgeCtx) => boolean;
}

/** A finished run (played to the end) with at least this many days. */
function finished(a: Activity, minDays = 1): a is Extract<Activity, { kind: 'runEnd' }> {
  return a.kind === 'runEnd' && a.complete && a.debrief.days >= minDays && a.debrief.reason !== 'bust';
}

const run = (a: Activity): Debrief | null => (a.kind === 'runEnd' ? a.debrief : null);

/** Recovered a fall of `depth` or more to a new high, within the run. */
export function cameBack(values: readonly number[], depth: number): boolean {
  let peak = values[0] ?? 0;
  let fell = false;
  for (const v of values) {
    if (fell && v > peak) return true;
    if (v > peak) peak = v;
    if (peak > 0 && 1 - v / peak >= depth) fell = true;
  }
  return false;
}

export const BADGES: readonly BadgeDef[] = [
  // Basics
  { id: 'first-trade', name: 'First trade', how: 'Make your first trade', group: 'basics', check: (a) => a.kind === 'fill' && !a.forced },
  { id: 'limit-legend', name: 'Limit legend', how: 'Have 10 limit orders filled', group: 'basics', check: (_a, p) => (p.counters.limitFills ?? 0) >= 10 },
  { id: 'stop-master', name: 'Stop master', how: 'A stop-loss sells, then the stock falls 10% more', group: 'basics', check: (a) => !!run(a)?.highlights.stopSaved },
  {
    id: 'dividend-collector',
    name: 'Dividend collector',
    how: 'Collect dividends from 10 different companies',
    group: 'basics',
    check: (_a, p) => p.dividendTickers.length >= 10,
  },
  // Process
  {
    id: 'diversified',
    name: 'Diversified',
    how: 'Close a day with 8+ holdings in 5+ sectors, none over 20%',
    group: 'process',
    check: (a) => {
      if (a.kind !== 'close' || a.holdings.length < 8 || a.value <= 0) return false;
      const sectors = new Set(a.holdings.map((h) => h.sector ?? 'Broad market'));
      return sectors.size >= 5 && a.holdings.every((h) => Math.abs(h.value) / a.value <= 0.2);
    },
  },
  { id: 'bought-the-dip', name: 'Bought the dip', how: 'Buy near a 30-day low, then watch it rise 8%', group: 'process', check: (a) => !!run(a)?.highlights.boughtDip },
  { id: 'diamond-hands', name: 'Diamond hands', how: 'Hold through a 20% fall and still come out ahead', group: 'process', check: (a) => !!run(a)?.highlights.diamondHands },
  {
    id: 'steady-hands',
    name: 'Steady hands',
    how: 'Finish a run where SPY fell 20%+ without a panic sale',
    group: 'process',
    check: (a) => finished(a) && a.debrief.spyWorstDrawdown >= 0.2 && a.debrief.panicSells === 0 && a.debrief.trades > 0,
  },
  {
    id: 'low-cost',
    name: 'Low cost',
    how: 'Finish a 60-day+ run with costs under 0.1% of your cash',
    group: 'process',
    check: (a) =>
      finished(a, 60) && a.debrief.trades > 0 && (a.debrief.fees + a.debrief.spread + a.debrief.interest + a.debrief.borrowFees) / a.debrief.startValue < 0.001,
  },
  { id: 'comeback', name: 'Comeback', how: 'Recover from a 15% fall to a new high in one run', group: 'process', check: (a) => !!run(a) && cameBack(run(a)?.you ?? [], 0.15) },
  // Results
  { id: 'index-slayer', name: 'Index slayer', how: 'Beat SPY in a run of 20+ days', group: 'results', check: (a) => finished(a, 20) && a.debrief.excessPts > 0 },
  { id: 'straight-a', name: 'Straight A', how: 'Get an A', group: 'results', check: (a) => finished(a, 10) && a.debrief.grade.letter === 'A' },
  {
    id: 'survivor',
    name: 'Survivor',
    how: 'Finish a run after being down 10% or more',
    group: 'results',
    check: (a) => finished(a) && Math.min(...a.debrief.you) <= a.debrief.startValue * 0.9,
  },
  { id: 'graduate', name: 'Graduate', how: 'Finish First steps', group: 'results', check: (a) => finished(a) && a.debrief.scenarioId === 'first-steps' },
  {
    id: 'boss-slayer',
    name: 'Boss slayer',
    how: 'Finish a boss run with a B or better',
    group: 'results',
    check: (a) => finished(a) && a.difficulty >= 4 && a.debrief.grade.score >= 75,
  },
  {
    id: 'crash-tested',
    name: 'Crash tested',
    how: 'Finish 2008 or COVID with a smaller drop than SPY',
    group: 'results',
    check: (a) =>
      finished(a) && ['gfc-2008', 'covid-2020'].includes(a.debrief.scenarioId) && a.debrief.worstDrawdown < a.debrief.spyWorstDrawdown && a.debrief.avgInvested >= 0.25,
  },
  { id: 'bubble-dodger', name: 'Bubble dodger', how: 'Beat SPY in the Dot-com bubble', group: 'results', check: (a) => finished(a) && a.debrief.scenarioId === 'dot-com' && a.debrief.excessPts > 0 },
  {
    id: 'meme-survivor',
    name: 'Meme survivor',
    how: 'Finish Meme squeeze with a C or better',
    group: 'results',
    check: (a) => finished(a) && a.debrief.scenarioId === 'meme-squeeze' && a.debrief.grade.score >= 60,
  },
  // Advanced
  {
    id: 'margin-survivor',
    name: 'Margin survivor',
    how: 'Finish a run using borrowed money without a margin call',
    group: 'advanced',
    check: (a) => finished(a, 20) && a.margin && a.debrief.avgLeverage > 1.1 && a.debrief.marginCalls === 0,
  },
  { id: 'short-seller', name: 'Short seller', how: 'Close a short at a profit', group: 'advanced', check: (a) => a.kind === 'fill' && a.short && a.side === 'buy' && !a.forced && a.realised > 0 },
  {
    id: 'replay-pro',
    name: 'Replay pro',
    how: 'Replay a moment and beat your first grade',
    group: 'advanced',
    check: (a) => a.kind === 'runEnd' && !!a.debrief.branchOf && a.debrief.grade.score > a.debrief.branchOf.score && a.debrief.grade.letter !== a.debrief.branchOf.letter,
  },
  // Habits
  { id: 'week-streak', name: 'Week streak', how: 'Play 7 days in a row', group: 'habits', check: (_a, p) => p.streak.count >= 7 },
  { id: 'scholar', name: 'Scholar', how: 'Finish every lesson', group: 'habits', check: (_a, p, ctx) => ctx.lessonCount > 0 && Object.keys(p.lessons).length >= ctx.lessonCount },
  { id: 'quest-hunter', name: 'Quest hunter', how: 'Complete 20 daily quests', group: 'habits', check: (_a, p) => (p.counters.questsDone ?? 0) >= 20 },
];

/** Badges this activity earns that the player doesn't have yet. */
export function newBadges(a: Activity, p: Progress, ctx: BadgeCtx): BadgeDef[] {
  return BADGES.filter((b) => !p.badges[b.id] && b.check(a, p, ctx));
}
