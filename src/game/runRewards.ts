import type { Reward, RewardSource } from './progress';

/**
 * What each save slot's run has earned so far, so its debrief still lists badges, quests and
 * level-ups after a reload. Kept next to progress (store `progress`, key `runRewards`). Pure.
 */

/** What one run earned, for the debrief. */
export interface RunRewards {
  levelBefore: number;
  rewards: Reward[];
}

export type SlotRewards = (RunRewards | null)[];

const SOURCES = new Set<string>([
  'run',
  'firstFinish',
  'quest',
  'lesson',
  'badge',
  'challenge',
] satisfies RewardSource[]);

function cleanReward(r: unknown): Reward | null {
  if (!r || typeof r !== 'object') return null;
  const x = r as Partial<Reward>;
  if (typeof x.label !== 'string' || typeof x.xp !== 'number' || !Number.isFinite(x.xp))
    return null;
  if (typeof x.source !== 'string' || !SOURCES.has(x.source)) return null;
  return {
    source: x.source as RewardSource,
    label: x.label,
    xp: x.xp,
    ...(typeof x.id === 'string' ? { id: x.id } : {}),
  };
}

/** A saved record cleaned up: one entry per slot, broken entries dropped. */
export function cleanSlotRewards(saved: unknown, slots: number): SlotRewards {
  const out: SlotRewards = Array(slots).fill(null);
  if (!Array.isArray(saved)) return out;
  for (let s = 0; s < slots; s++) {
    const e = saved[s] as Partial<RunRewards> | null | undefined;
    if (
      !e ||
      typeof e !== 'object' ||
      !Number.isInteger(e.levelBefore) ||
      !Array.isArray(e.rewards)
    )
      continue;
    out[s] = {
      levelBefore: e.levelBefore as number,
      rewards: e.rewards.map(cleanReward).filter((r): r is Reward => !!r),
    };
  }
  return out;
}

export function setSlotRewards(
  all: SlotRewards,
  slot: number,
  value: RunRewards | null,
): SlotRewards {
  if (slot < 0 || slot >= all.length) return all;
  const out = [...all];
  out[slot] = value;
  return out;
}

/** Forget the rewards of slots that are empty now. */
export function keepFilled(all: SlotRewards, filled: readonly unknown[]): SlotRewards {
  return all.some((e, s) => e && !filled[s]) ? all.map((e, s) => (filled[s] ? e : null)) : all;
}
