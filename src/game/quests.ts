import type { Activity } from '../engine/activity';
import { childSeed, createRng } from '../engine/rng';

/**
 * Daily quests: three a day (one learning, one trading, one stretch), picked from the date
 * alone, so they work offline and everyone gets the same three on the same day. None pays
 * for trading more: they ask for a kind of order, a habit or a result, never a count of trades.
 */

export type QuestTier = 'learn' | 'trade' | 'stretch';

export interface QuestDef {
  id: string;
  tier: QuestTier;
  text: string;
  goal: number;
  xp: number;
  /**
   * How an activity moves the quest: 'add' adds to progress, 'max' keeps the highest value seen
   * (for "hold one stock 5 days"). Return 0 when it doesn't apply.
   */
  mode: 'add' | 'max';
  measure: (a: Activity) => number;
}

const sectors = (a: Activity) => (a.kind === 'close' ? new Set(a.holdings.map((h) => h.sector ?? 'Broad market')).size : 0);

export const QUESTS: readonly QuestDef[] = [
  { id: 'glossary-2', tier: 'learn', text: 'Read 2 glossary cards', goal: 2, xp: 30, mode: 'add', measure: (a) => (a.kind === 'glossaryRead' ? 1 : 0) },
  { id: 'glossary-5', tier: 'learn', text: 'Read 5 glossary cards', goal: 5, xp: 50, mode: 'add', measure: (a) => (a.kind === 'glossaryRead' ? 1 : 0) },
  { id: 'lesson-1', tier: 'learn', text: 'Finish a lesson', goal: 1, xp: 40, mode: 'add', measure: (a) => (a.kind === 'lessonDone' ? 1 : 0) },
  { id: 'lesson-2', tier: 'learn', text: 'Finish 2 lessons', goal: 2, xp: 60, mode: 'add', measure: (a) => (a.kind === 'lessonDone' ? 1 : 0) },
  {
    id: 'limit',
    tier: 'trade',
    text: 'Place a limit order',
    goal: 1,
    xp: 50,
    mode: 'add',
    measure: (a) => (a.kind === 'order' && a.type === 'limit' ? 1 : 0),
  },
  {
    id: 'stop',
    tier: 'trade',
    text: 'Set a stop-loss',
    goal: 1,
    xp: 50,
    mode: 'add',
    measure: (a) => (a.kind === 'order' && a.type === 'stop' && a.side === 'sell' && !a.short ? 1 : 0),
  },
  {
    id: 'etf',
    tier: 'trade',
    text: 'Buy a fund (ETF)',
    goal: 1,
    xp: 40,
    mode: 'add',
    measure: (a) => (a.kind === 'fill' && a.side === 'buy' && a.etf && !a.short ? 1 : 0),
  },
  { id: 'sectors-3', tier: 'trade', text: 'Own 3 sectors at a close', goal: 3, xp: 50, mode: 'max', measure: sectors },
  {
    id: 'dividend',
    tier: 'trade',
    text: 'Collect a dividend',
    goal: 1,
    xp: 50,
    mode: 'add',
    measure: (a) => (a.kind === 'close' && a.dividends > 0 ? 1 : 0),
  },
  {
    id: 'earnings',
    tier: 'trade',
    text: 'Hold a stock through its earnings',
    goal: 1,
    xp: 60,
    mode: 'add',
    measure: (a) => (a.kind === 'close' && a.earningsHeld.length > 0 ? 1 : 0),
  },
  {
    id: 'hold-5',
    tier: 'stretch',
    text: 'Hold one stock for 5 days',
    goal: 5,
    xp: 80,
    mode: 'max',
    measure: (a) => (a.kind === 'close' ? Math.max(0, ...a.holdings.filter((h) => !h.etf).map((h) => h.heldDays)) : 0),
  },
  {
    id: 'beat-spy-3',
    tier: 'stretch',
    text: 'Beat SPY on 3 trading days',
    goal: 3,
    xp: 80,
    mode: 'add',
    measure: (a) => (a.kind === 'close' && a.holdings.length > 0 && a.dayPct > a.spyPct ? 1 : 0),
  },
  { id: 'play-20', tier: 'stretch', text: 'Play 20 trading days', goal: 20, xp: 80, mode: 'add', measure: (a) => (a.kind === 'close' ? 1 : 0) },
  { id: 'finish', tier: 'stretch', text: 'Finish a run', goal: 1, xp: 100, mode: 'add', measure: (a) => (a.kind === 'runEnd' && a.complete ? 1 : 0) },
  {
    id: 'grade-b',
    tier: 'stretch',
    text: 'Get a B or better',
    goal: 1,
    xp: 100,
    mode: 'add',
    measure: (a) => (a.kind === 'runEnd' && a.debrief.days >= 10 && a.debrief.grade.score >= 75 ? 1 : 0),
  },
  { id: 'replay', tier: 'stretch', text: 'Replay a moment', goal: 1, xp: 60, mode: 'add', measure: (a) => (a.kind === 'replay' ? 1 : 0) },
  { id: 'diversify-5', tier: 'stretch', text: 'Own 5 sectors at a close', goal: 5, xp: 80, mode: 'max', measure: sectors },
];

const TIERS: readonly QuestTier[] = ['learn', 'trade', 'stretch'];

/** The three quests for a local date (`YYYY-MM-DD`). */
export function questsFor(date: string): QuestDef[] {
  const rand = createRng(childSeed(20_261_116, `quests:${date}`));
  return TIERS.map((tier) => {
    const pool = QUESTS.filter((q) => q.tier === tier);
    return pool[Math.floor(rand() * pool.length)] as QuestDef;
  });
}

export interface QuestState {
  date: string;
  progress: number[];
  claimed: boolean[];
}

export function freshQuests(date: string): QuestState {
  return { date, progress: [0, 0, 0], claimed: [false, false, false] };
}

/** Apply one activity to today's quests. Returns the new state and the quests just completed. */
export function advanceQuests(state: QuestState | null, date: string, a: Activity): { state: QuestState; completed: QuestDef[] } {
  const s = state && state.date === date ? state : freshQuests(date);
  const defs = questsFor(date);
  const progress = [...s.progress];
  const claimed = [...s.claimed];
  const completed: QuestDef[] = [];
  defs.forEach((q, k) => {
    if (claimed[k]) return;
    const m = q.measure(a);
    if (!m) return;
    const before = progress[k] ?? 0;
    progress[k] = Math.min(q.goal, q.mode === 'add' ? before + m : Math.max(before, m));
    if ((progress[k] ?? 0) >= q.goal) {
      claimed[k] = true;
      completed.push(q);
    }
  });
  if (!completed.length && progress.every((v, k) => v === s.progress[k]) && s === state) return { state: s, completed };
  return { state: { date, progress, claimed }, completed };
}

/** Milliseconds until local midnight, for "resets in hh:mm:ss". */
export function msToMidnight(now: Date): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return next.getTime() - now.getTime();
}
