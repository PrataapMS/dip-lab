import { createContext, type ComponentChildren } from 'preact';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Activity, WorkerEvent } from '../engine/protocol';
import { SCENARIOS } from '../engine/scenarios';
import { levelFor } from '../game/levels';
import {
  applyActivity,
  completeLesson,
  finishChallenge,
  finishRun,
  migrate,
  type Progress,
  type Reward,
  type RunResult,
} from '../game/progress';
import {
  cleanSlotRewards,
  keepFilled,
  type RunRewards,
  type SlotRewards,
  setSlotRewards,
} from '../game/runRewards';
import { migrateSettings, pauseAtCloseFor, type Settings } from '../game/settings';
import { challengeById } from '../learn/challenges';
import { type Lesson, LESSONS } from '../learn/lessons';
import { load, save } from '../storage/db';
import { SLOTS } from '../storage/slots';
import { cueFor, play, setSoundEnabled } from './sound';
import type { Market, MarketView } from './useMarket';

const KEY = 'player';
const SETTINGS_KEY = 'settings';
const RUN_REWARDS_KEY = 'runRewards';
const BADGE_CTX = { lessonCount: LESSONS.length };
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

export type { RunRewards };

export interface ProgressApi {
  progress: Progress;
  /** Rewards earned since the current run started. */
  run: RunRewards;
  /** Change progress; returned rewards are added to the run's list and announced. */
  update: (fn: (p: Progress) => { progress: Progress; rewards?: Reward[] }) => void;
  /** Record something the player did (glossary, lessons…) for quests and streaks. */
  record: (a: Activity) => void;
  /** A lesson's question was answered right. */
  finishLesson: (lesson: Lesson) => void;
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
}

const Ctx = createContext<ProgressApi | null>(null);

export function useProgress(): ProgressApi {
  const api = useContext(Ctx);
  if (!api) throw new Error('useProgress outside ProgressProvider');
  return api;
}

/** Loads progress from the device, saves every change, and turns run events into XP. */
export function ProgressProvider({
  market,
  children,
}: {
  market: Market;
  children: ComponentChildren;
}) {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [run, setRun] = useState<RunRewards>({ levelBefore: 1, rewards: [] });
  const viewRef = useRef(market.view);
  viewRef.current = market.view;
  const progressRef = useRef<Progress | null>(null);
  progressRef.current = progress;

  // Each slot's rewards so far, so a reloaded run's debrief still lists them.
  const slotRewards = useRef<SlotRewards>(Array(SLOTS).fill(null));
  const slotRewardsRead = useRef<Promise<void>>(Promise.resolve());
  /** The slot `run` belongs to, once it is known. */
  const runSlot = useRef<number | null>(null);
  const storeSlotRewards = useCallback((slot: number, value: RunRewards | null) => {
    slotRewards.current = setSlotRewards(slotRewards.current, slot, value);
    void save('progress', RUN_REWARDS_KEY, slotRewards.current);
  }, []);
  useEffect(() => {
    if (runSlot.current !== null) storeSlotRewards(runSlot.current, run);
  }, [run, storeSlotRewards]);

  useEffect(() => {
    let live = true;
    slotRewardsRead.current = load('progress', RUN_REWARDS_KEY).then((saved) => {
      if (live) slotRewards.current = cleanSlotRewards(saved, SLOTS);
    });
    load('progress', KEY).then((saved) => {
      if (live) setProgress(migrate(saved));
    });
    load('progress', SETTINGS_KEY).then((saved) => {
      if (live) setSettings(migrateSettings(saved));
    });
    return () => {
      live = false;
    };
  }, []);

  const { notify, send } = market;
  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((s) => {
      if (!s) return s;
      const next = { ...s, ...patch };
      void save('progress', SETTINGS_KEY, next);
      return next;
    });
  }, []);
  const soundOn = settings?.sound;
  useEffect(() => {
    if (soundOn !== undefined) setSoundEnabled(soundOn);
  }, [soundOn]);
  useEffect(
    () =>
      market.subscribe((e) => {
        const cue = cueFor(e);
        if (cue) play(cue);
      }),
    [market.subscribe],
  );
  // The worker starts new runs with these.
  const dayLengthMs = settings?.dayLengthMs;
  const pauseRule = settings?.pauseAtClose;
  useEffect(() => {
    if (dayLengthMs === undefined || pauseRule === undefined) return;
    send({ type: 'defaults', dayLengthMs, pauseAtClose: pauseAtCloseFor(pauseRule) ?? null });
  }, [send, dayLengthMs, pauseRule]);
  // "Next event" stops for the watchlist's earnings and dividends.
  const watchlist = settings?.watchlist;
  useEffect(() => {
    if (watchlist) send({ type: 'watchlist', tickers: watchlist });
  }, [send, watchlist]);
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
        play(after.level > before ? 'levelUp' : 'chime');
      }
    },
    [notify],
  );

  const record = useCallback(
    (a: Activity) => update((p) => applyActivity(p, a, today(), BADGE_CTX)),
    [update],
  );
  const finishLesson = useCallback(
    (lesson: Lesson) => update((p) => completeLesson(p, lesson, today(), BADGE_CTX)),
    [update],
  );

  const { subscribe } = market;
  useEffect(
    () =>
      subscribe((e: WorkerEvent) => {
        const p = progressRef.current;
        if (e.type === 'loaded') {
          const fresh = { levelBefore: levelFor(p?.xp ?? 0).level, rewards: [] };
          runSlot.current = null;
          if (e.restored && e.slot !== null) {
            const slot = e.slot;
            void slotRewardsRead.current.then(() => {
              runSlot.current = slot;
              setRun(slotRewards.current[slot] ?? fresh);
            });
          } else {
            runSlot.current = e.slot;
            setRun(fresh);
          }
          if (e.branchOf && !e.restored) record({ kind: 'replay', day: e.branchOf.day });
        }
        if (e.type === 'imported') {
          // The run open in that slot (if any) was replaced and is no longer saved.
          if (runSlot.current === e.slot) runSlot.current = null;
          storeSlotRewards(e.slot, null);
        }
        if (e.type === 'slots') {
          const kept = keepFilled(slotRewards.current, e.headers);
          if (kept !== slotRewards.current) {
            slotRewards.current = kept;
            void save('progress', RUN_REWARDS_KEY, kept);
          }
        }
        if (e.type === 'activity') for (const a of e.items) record(a);
        // A run opened already finished was rewarded when it ended (or was imported).
        if (e.type === 'ended' && !e.restored) {
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
          record({
            kind: 'runEnd',
            debrief: d,
            difficulty: result.difficulty,
            complete: result.complete,
            margin: !!v.settings?.margin,
          });
          const challenge = v.config?.challenge ? challengeById(v.config.challenge) : undefined;
          if (challenge && challenge.scenarioId === d.scenarioId && v.seed === challenge.seed) {
            const passed = result.complete && challenge.passed(d);
            update((p) =>
              finishChallenge(p, challenge, {
                passed,
                letter: d.grade.letter,
                score: d.grade.score,
              }),
            );
          }
        }
      }),
    [subscribe, update, record, storeSlotRewards],
  );

  const api = useMemo(
    () =>
      progress && settings
        ? { progress, run, update, record, finishLesson, settings, updateSettings }
        : null,
    [progress, run, update, record, finishLesson, settings, updateSettings],
  );
  if (!api) return null;
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
