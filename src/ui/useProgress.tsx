import { createContext, type ComponentChildren } from 'preact';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Activity, WorkerEvent } from '../engine/protocol';
import { SCENARIOS } from '../engine/scenarios';
import { levelFor } from '../game/levels';
import { applyActivity, finishRun, migrate, type Progress, type Reward, type RunResult } from '../game/progress';
import { load, save } from './storage';
import type { Market, MarketView } from './useMarket';

const KEY = 'player';
/** Custom runs are difficulty 2, like the Custom card. */
const CUSTOM_DIFFICULTY = 2;

/** The local calendar date, `YYYY-MM-DD`: quests and streaks follow the device's day. */
export function today(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** Identifies a market for the replay rule: scenario, seed and any custom options. */
export function runKey(view: Pick<MarketView, 'config' | 'scenario' | 'seed'>): string {
  const c = view.config;
  const id = view.scenario?.id ?? c?.scenarioId ?? '?';
  return `${id}:${view.seed}${c?.custom ? `:${JSON.stringify(c.custom)}` : ''}`;
}

export function difficultyOf(scenarioId: string): number {
  return SCENARIOS.find((s) => s.id === scenarioId)?.difficulty ?? CUSTOM_DIFFICULTY;
}

/** What one run earned, for the debrief. */
export interface RunRewards {
  levelBefore: number;
  rewards: Reward[];
}

export interface ProgressApi {
  progress: Progress;
  /** Rewards earned since the current run started. */
  run: RunRewards;
  /** Change progress; returned rewards are added to the run's list and announced. */
  update: (fn: (p: Progress) => { progress: Progress; rewards?: Reward[] }) => void;
  /** Record something the player did (glossary, lessons…) for quests and streaks. */
  record: (a: Activity) => void;
}

const Ctx = createContext<ProgressApi | null>(null);

export function useProgress(): ProgressApi {
  const api = useContext(Ctx);
  if (!api) throw new Error('useProgress outside ProgressProvider');
  return api;
}

/** Loads progress from the device, saves every change, and turns run events into XP. */
export function ProgressProvider({ market, children }: { market: Market; children: ComponentChildren }) {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [run, setRun] = useState<RunRewards>({ levelBefore: 1, rewards: [] });
  const viewRef = useRef(market.view);
  viewRef.current = market.view;
  const progressRef = useRef<Progress | null>(null);
  progressRef.current = progress;

  useEffect(() => {
    let live = true;
    load('progress', KEY).then((saved) => {
      if (live) setProgress(migrate(saved));
    });
    return () => {
      live = false;
    };
  }, []);

  const { notify } = market;
  const update = useCallback(
    (fn: (p: Progress) => { progress: Progress; rewards?: Reward[] }) => {
      const current = progressRef.current;
      if (!current) return;
      const r = fn(current);
      if (r.progress === current && !r.rewards?.length) return;
      progressRef.current = r.progress;
      setProgress(r.progress);
      void save('progress', KEY, r.progress);
      const rewards = r.rewards ?? [];
      if (rewards.length) {
        setRun((s) => ({ ...s, rewards: [...s.rewards, ...rewards] }));
        for (const w of rewards) notify(true, `+${w.xp} XP · ${w.label}`);
        const before = levelFor(current.xp).level;
        const after = levelFor(r.progress.xp);
        if (after.level > before) notify(true, `Level up! Lv ${after.level} · ${after.rank}`);
      }
    },
    [notify],
  );

  const record = useCallback((a: Activity) => update((p) => applyActivity(p, a, today())), [update]);

  const { subscribe } = market;
  useEffect(
    () =>
      subscribe((e: WorkerEvent) => {
        const p = progressRef.current;
        if (e.type === 'loaded') {
          setRun({ levelBefore: levelFor(p?.xp ?? 0).level, rewards: [] });
          if (e.branchOf) record({ kind: 'replay', day: e.branchOf.day });
        }
        if (e.type === 'activity') for (const a of e.items) record(a);
        if (e.type === 'ended') {
          const v = viewRef.current;
          const d = e.debrief;
          const result: RunResult = {
            scenarioId: d.scenarioId,
            scenarioName: d.scenarioName,
            runKey: runKey(v),
            difficulty: difficultyOf(d.scenarioId),
            letter: d.grade.letter,
            score: d.grade.score,
            days: d.days,
            totalDays: v.dates.length,
            complete: e.reason === 'lastDay' || e.reason === 'target',
          };
          update((p) => finishRun(p, result));
          record({ kind: 'runEnd', debrief: d, difficulty: result.difficulty, complete: result.complete, margin: !!v.settings?.margin });
        }
      }),
    [subscribe, update, record],
  );

  const api = useMemo(() => (progress ? { progress, run, update, record } : null), [progress, run, update, record]);
  if (!api) return null;
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
