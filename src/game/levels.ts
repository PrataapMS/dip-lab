/**
 * Levels, ranks and unlocks. Pure: XP in, level out. Level n needs 400 + 200n XP to reach
 * level n + 1 (Lv 1 → 2: 600, Lv 3 → 4: 1,000, Lv 4 → 5: 1,200).
 */

export function xpToNext(level: number): number {
  return 400 + 200 * level;
}

/** Total XP needed to reach a level (Lv 1 = 0). */
export function xpForLevel(level: number): number {
  let total = 0;
  for (let n = 1; n < level; n++) total += xpToNext(n);
  return total;
}

export const RANKS = [
  { from: 1, name: 'Intern' },
  { from: 3, name: 'Chart reader' },
  { from: 4, name: 'Quant padawan' },
  { from: 6, name: 'Risk manager' },
  { from: 9, name: 'Portfolio wizard' },
] as const;

export type RankName = (typeof RANKS)[number]['name'];

export function rankFor(level: number): RankName {
  let name: RankName = RANKS[0].name;
  for (const r of RANKS) if (level >= r.from) name = r.name;
  return name;
}

export interface LevelInfo {
  level: number;
  rank: RankName;
  /** XP earned inside this level, and needed to finish it. */
  into: number;
  need: number;
  /** The rank the next level brings, if it changes. */
  nextRank: RankName | null;
}

export function levelFor(xp: number): LevelInfo {
  let level = 1;
  let left = Math.max(0, Math.floor(xp));
  while (left >= xpToNext(level)) {
    left -= xpToNext(level);
    level++;
  }
  const next = rankFor(level + 1);
  return {
    level,
    rank: rankFor(level),
    into: left,
    need: xpToNext(level),
    nextRank: next !== rankFor(level) ? next : null,
  };
}

/** What levels unlock. */
export const UNLOCKS = {
  margin: { level: 4, label: 'Margin (borrow up to 2x)' },
  'meme-squeeze': { level: 5, label: 'Meme squeeze' },
  shorts: { level: 5, label: 'Short selling' },
} as const;

export type Unlock = keyof typeof UNLOCKS;

export function isUnlocked(what: Unlock, level: number, unlockAll = false): boolean {
  return unlockAll || level >= UNLOCKS[what].level;
}

/** Unlocks gained by going from one level to another, lowest first. */
export function unlocksBetween(from: number, to: number): Unlock[] {
  return (Object.keys(UNLOCKS) as Unlock[])
    .filter((k) => UNLOCKS[k].level > from && UNLOCKS[k].level <= to)
    .sort((a, b) => UNLOCKS[a].level - UNLOCKS[b].level);
}

/** The next unlock above a level, for "Meme squeeze unlocks at Lv 5". */
export function nextUnlock(level: number): { what: Unlock; level: number; label: string } | null {
  const ahead = (Object.keys(UNLOCKS) as Unlock[])
    .filter((k) => UNLOCKS[k].level > level)
    .sort((a, b) => UNLOCKS[a].level - UNLOCKS[b].level);
  const what = ahead[0];
  return what ? { what, level: UNLOCKS[what].level, label: UNLOCKS[what].label } : null;
}
