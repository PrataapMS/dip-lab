import type { Debrief } from '../engine/debrief';

/**
 * Challenges: a scenario on a fixed seed (so everyone, and every retry, faces the same
 * market) with a goal checked from the debrief. Pays XP the first time it is passed.
 */

export interface Challenge {
  id: string;
  title: string;
  scenarioId: string;
  seed: number;
  goal: string;
  xp: number;
  /** The goal, checked on a run played to its last day. */
  passed: (d: Debrief) => boolean;
}

const costShare = (d: Debrief) => (d.fees + d.spread + d.interest + d.borrowFees) / d.startValue;

export const CHALLENGES: readonly Challenge[] = [
  {
    id: 'first-ahead',
    title: 'Beat the index',
    scenarioId: 'first-steps',
    seed: 1001,
    goal: 'Finish ahead of buy-and-hold SPY.',
    xp: 150,
    passed: (d) => d.excessPts > 0,
  },
  {
    id: 'chop-costs',
    title: 'Sit still',
    scenarioId: 'sideways-chop',
    seed: 1002,
    goal: 'Keep costs under 0.2% of your cash and finish within 1 point of SPY.',
    xp: 150,
    passed: (d) => d.trades > 0 && costShare(d) < 0.002 && d.excessPts >= -1,
  },
  {
    id: 'covid-nerve',
    title: 'Hold your nerve',
    scenarioId: 'covid-2020',
    seed: 1003,
    goal: 'No panic sales, and stay at least 80% invested on average.',
    xp: 250,
    passed: (d) => d.panicSells === 0 && d.avgInvested >= 0.8,
  },
  {
    id: 'gfc-drawdown',
    title: 'Fall less',
    scenarioId: 'gfc-2008',
    seed: 1004,
    goal: 'End with a smaller worst drop than SPY’s, while at least half invested on average.',
    xp: 300,
    passed: (d) => d.worstDrawdown < d.spyWorstDrawdown && d.avgInvested >= 0.5,
  },
  {
    id: 'dotcom-spread',
    title: 'Spread out',
    scenarioId: 'dot-com',
    seed: 1005,
    goal: 'Beat SPY with no single stock ever over 20% of your account.',
    xp: 300,
    passed: (d) => d.excessPts > 0 && (d.maxWeight?.weight ?? 0) <= 0.2,
  },
  {
    id: 'bull-patience',
    title: 'Patience pays',
    scenarioId: 'long-bull',
    seed: 1006,
    goal: '12 trades or fewer, and a B or better.',
    xp: 200,
    passed: (d) => d.trades <= 12 && d.grade.score >= 75,
  },
  {
    id: 'earnings-spread',
    title: 'Earnings season, spread out',
    scenarioId: 'earnings-season',
    seed: 1007,
    goal: 'Finish up, holding 5 or more stocks at the end.',
    xp: 200,
    passed: (d) => d.ret > 0 && d.endHoldings >= 5,
  },
  {
    id: 'meme-discipline',
    title: 'Don’t chase it',
    scenarioId: 'meme-squeeze',
    seed: 1008,
    goal: 'Finish up with no stock ever over 10% of your account.',
    xp: 300,
    passed: (d) => d.ret > 0 && (d.maxWeight?.weight ?? 0) <= 0.1,
  },
];

export function challengeById(id: string): Challenge | undefined {
  return CHALLENGES.find((c) => c.id === id);
}
