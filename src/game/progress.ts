import type { Activity } from '../engine/activity';
import { levelFor } from './levels';
import { type BadgeCtx, newBadges } from './badges';
import { advanceQuests, type QuestState } from './quests';
import { markPlayed, type Streak } from './streak';
import { FIRST_FINISH_XP, replayAward, runXp, XP } from './xp';

/**
 * The player's progress: XP, badges, lessons, streak, today's quests. One plain record,
 * saved on the device (IndexedDB) by the UI. Pure functions here; dates come in as
 * `YYYY-MM-DD` strings from the UI, so nothing reads the clock.
 */

export const PROGRESS_VERSION = 1;

export interface Progress {
  version: number;
  name: string;
  xp: number;
  /** Badge id → date earned. */
  badges: Record<string, string>;
  /** Lesson id → done. */
  lessons: Record<string, true>;
  /** Challenge id → best result. */
  challenges: Record<string, { letter: string; score: number }>;
  /** Best run XP per market (scenario + seed + options), for the replay rule. */
  bestXp: Record<string, number>;
  /** Scenario id → runs finished. */
  finished: Record<string, number>;
  /** Scenario id → best grade. */
  bestGrade: Record<string, { letter: string; score: number }>;
  streak: Streak;
  /** Today's quests: progress towards each, and whether it was claimed. */
  quests: QuestState | null;
  /** Running totals for badges and quests (limit fills, quests done, …). */
  counters: Record<string, number>;
  /** Glossary terms opened at least once. */
  glossarySeen: string[];
  /** Companies that have paid you a dividend. */
  dividendTickers: string[];
  tutorialDone: boolean;
  /** Testing switch: everything unlocked whatever the level. */
  unlockAll: boolean;
}

export function emptyProgress(): Progress {
  return {
    version: PROGRESS_VERSION,
    name: 'player_one',
    xp: 0,
    badges: {},
    lessons: {},
    challenges: {},
    bestXp: {},
    finished: {},
    bestGrade: {},
    streak: { count: 0, best: 0, last: null },
    quests: null,
    counters: {},
    glossarySeen: [],
    dividendTickers: [],
    tutorialDone: false,
    unlockAll: false,
  };
}

/** Accept whatever was saved (older versions, partial or broken records) and fill the gaps. */
export function migrate(saved: unknown): Progress {
  const base = emptyProgress();
  if (!saved || typeof saved !== 'object') return base;
  const s = saved as Partial<Progress>;
  const obj = <T>(v: unknown, d: T): T =>
    v && typeof v === 'object' && !Array.isArray(v) ? (v as T) : d;
  return {
    ...base,
    name: typeof s.name === 'string' && s.name ? s.name : base.name,
    xp: Number.isFinite(s.xp) && (s.xp ?? 0) > 0 ? Math.floor(s.xp ?? 0) : 0,
    badges: obj(s.badges, base.badges),
    lessons: obj(s.lessons, base.lessons),
    challenges: obj(s.challenges, base.challenges),
    bestXp: obj(s.bestXp, base.bestXp),
    finished: obj(s.finished, base.finished),
    bestGrade: obj(s.bestGrade, base.bestGrade),
    streak: obj(s.streak, base.streak),
    quests: s.quests && typeof s.quests === 'object' ? s.quests : null,
    counters: obj(s.counters, base.counters),
    glossarySeen: Array.isArray(s.glossarySeen)
      ? s.glossarySeen.filter((x) => typeof x === 'string')
      : [],
    dividendTickers: Array.isArray(s.dividendTickers)
      ? s.dividendTickers.filter((x) => typeof x === 'string')
      : [],
    tutorialDone: s.tutorialDone === true,
    unlockAll: s.unlockAll === true,
    version: PROGRESS_VERSION,
  };
}

export type RewardSource = 'run' | 'firstFinish' | 'quest' | 'lesson' | 'badge' | 'challenge';

export interface Reward {
  source: RewardSource;
  label: string;
  xp: number;
  /** The badge, quest, lesson or challenge it came from. */
  id?: string;
}

export function grant(p: Progress, rewards: readonly Reward[]): Progress {
  const xp = rewards.reduce((s, r) => s + r.xp, 0);
  return xp ? { ...p, xp: p.xp + xp } : p;
}

export function level(p: Progress): number {
  return levelFor(p.xp).level;
}

export function bump(p: Progress, counter: string, by = 1): Progress {
  return { ...p, counters: { ...p.counters, [counter]: (p.counters[counter] ?? 0) + by } };
}

export interface RunResult {
  scenarioId: string;
  scenarioName: string;
  /** Identifies the market: scenario, seed and any custom options. */
  runKey: string;
  difficulty: number;
  letter: string;
  score: number;
  days: number;
  totalDays: number;
  complete: boolean;
}

/** Record a finished run and the XP it earns. */
export function finishRun(p: Progress, r: RunResult): { progress: Progress; rewards: Reward[] } {
  const rewards: Reward[] = [];
  const worth = runXp(r);
  const best = p.bestXp[r.runKey] ?? 0;
  const award = replayAward(worth, best);
  if (award > 0)
    rewards.push({
      source: 'run',
      label: best > 0 ? `${r.scenarioName}: beat your best` : `${r.scenarioName} · ${r.letter}`,
      xp: award,
    });
  const firstFinish = r.complete && !p.finished[r.scenarioId];
  if (firstFinish)
    rewards.push({
      source: 'firstFinish',
      label: `First finish: ${r.scenarioName}`,
      xp: FIRST_FINISH_XP,
    });
  const prevGrade = p.bestGrade[r.scenarioId];
  let next: Progress = {
    ...p,
    bestXp: worth > best ? { ...p.bestXp, [r.runKey]: worth } : p.bestXp,
    finished: r.complete
      ? { ...p.finished, [r.scenarioId]: (p.finished[r.scenarioId] ?? 0) + 1 }
      : p.finished,
    bestGrade:
      r.days >= 10 && (!prevGrade || r.score > prevGrade.score)
        ? { ...p.bestGrade, [r.scenarioId]: { letter: r.letter, score: r.score } }
        : p.bestGrade,
  };
  next = grant(next, rewards);
  return { progress: next, rewards };
}

const NO_LESSONS: BadgeCtx = { lessonCount: 0 };

/** Apply one activity on a local date: running totals, streak, quests, then badges. */
export function applyActivity(
  p: Progress,
  a: Activity,
  date: string,
  ctx: BadgeCtx = NO_LESSONS,
): { progress: Progress; rewards: Reward[] } {
  const rewards: Reward[] = [];
  const q = advanceQuests(p.quests, date, a);
  let next: Progress = q.state === p.quests ? p : { ...p, quests: q.state };
  for (const done of q.completed) {
    rewards.push({ source: 'quest', label: `Quest: ${done.text}`, xp: done.xp, id: done.id });
    next = bump(next, 'questsDone');
  }
  if (a.kind === 'close' || a.kind === 'lessonDone') {
    const streak = markPlayed(next.streak, date);
    if (streak !== next.streak) next = { ...next, streak };
  }
  if (a.kind === 'glossaryRead' && !next.glossarySeen.includes(a.term))
    next = { ...next, glossarySeen: [...next.glossarySeen, a.term] };
  if (a.kind === 'fill' && a.orderType === 'limit' && !a.forced) next = bump(next, 'limitFills');
  if (a.kind === 'close') {
    const fresh = a.dividendTickers.filter((t) => !next.dividendTickers.includes(t));
    if (fresh.length) next = { ...next, dividendTickers: [...next.dividendTickers, ...fresh] };
  }
  for (const b of newBadges(a, next, ctx)) {
    next = { ...next, badges: { ...next.badges, [b.id]: date } };
    rewards.push({ source: 'badge', label: `Badge: ${b.name}`, xp: XP.badge, id: b.id });
  }
  return { progress: grant(next, rewards), rewards };
}

/** A lesson's question answered right: XP the first time, plus quest and streak credit. */
export function completeLesson(
  p: Progress,
  lesson: { id: string; title: string },
  date: string,
  ctx: BadgeCtx = NO_LESSONS,
): { progress: Progress; rewards: Reward[] } {
  const first = !p.lessons[lesson.id];
  let next: Progress = first ? { ...p, lessons: { ...p.lessons, [lesson.id]: true } } : p;
  const rewards: Reward[] = first
    ? [{ source: 'lesson', label: `Lesson: ${lesson.title}`, xp: XP.lesson, id: lesson.id }]
    : [];
  next = grant(next, rewards);
  const r = applyActivity(next, { kind: 'lessonDone', lesson: lesson.id }, date, ctx);
  return { progress: r.progress, rewards: [...rewards, ...r.rewards] };
}

/** A challenge run finished: XP the first time its goal is met; the best grade is kept. */
export function finishChallenge(
  p: Progress,
  c: { id: string; title: string; xp: number },
  result: { passed: boolean; letter: string; score: number },
): { progress: Progress; rewards: Reward[] } {
  if (!result.passed) return { progress: p, rewards: [] };
  const prev = p.challenges[c.id];
  const rewards: Reward[] = prev
    ? []
    : [{ source: 'challenge', label: `Challenge: ${c.title}`, xp: c.xp, id: c.id }];
  const best =
    !prev || result.score > prev.score ? { letter: result.letter, score: result.score } : prev;
  return {
    progress: grant({ ...p, challenges: { ...p.challenges, [c.id]: best } }, rewards),
    rewards,
  };
}
