import { describe, expect, it } from 'vitest';
import {
  isUnlocked,
  levelFor,
  nextUnlock,
  rankFor,
  unlocksBetween,
  xpForLevel,
  xpToNext,
} from './levels';
import { emptyProgress, finishRun, migrate, type RunResult } from './progress';
import { baseRunXp, runXp } from './xp';

describe('levels', () => {
  it('follows 400 + 200n per level, matching the design', () => {
    expect([1, 2, 3, 4].map(xpToNext)).toEqual([600, 800, 1_000, 1_200]);
    expect(xpForLevel(5)).toBe(3_600);
    expect(levelFor(0)).toMatchObject({ level: 1, into: 0, need: 600, rank: 'Intern' });
    expect(levelFor(599).level).toBe(1);
    expect(levelFor(600)).toMatchObject({ level: 2, into: 0 });
    // The canvas: 620 / 1,000 XP at Lv 3, next rank Quant padawan.
    expect(levelFor(1_400 + 620)).toMatchObject({
      level: 3,
      into: 620,
      need: 1_000,
      rank: 'Chart reader',
      nextRank: 'Quant padawan',
    });
    expect(levelFor(3_600).level).toBe(5);
  });

  it('names ranks by level', () => {
    expect([1, 2, 3, 4, 5, 6, 8, 9, 20].map(rankFor)).toEqual([
      'Intern',
      'Intern',
      'Chart reader',
      'Quant padawan',
      'Quant padawan',
      'Risk manager',
      'Risk manager',
      'Portfolio wizard',
      'Portfolio wizard',
    ]);
  });

  it('unlocks margin at 4, Meme squeeze and shorts at 5', () => {
    expect(isUnlocked('margin', 3)).toBe(false);
    expect(isUnlocked('margin', 4)).toBe(true);
    expect(isUnlocked('meme-squeeze', 4)).toBe(false);
    expect(isUnlocked('shorts', 5)).toBe(true);
    expect(isUnlocked('shorts', 1, true)).toBe(true);
    expect(unlocksBetween(3, 5)).toEqual(['margin', 'meme-squeeze', 'shorts']);
    expect(unlocksBetween(4, 4)).toEqual([]);
    expect(nextUnlock(4)?.level).toBe(5);
    expect(nextUnlock(5)).toBeNull();
  });
});

describe('run XP', () => {
  const run = { difficulty: 1, letter: 'B', days: 61, totalDays: 61, complete: true };

  it('is 100 × difficulty × the grade factor', () => {
    expect(baseRunXp(4)).toBe(400);
    expect(runXp(run)).toBe(140);
    expect(runXp({ ...run, letter: 'A' })).toBe(200);
    expect(runXp({ ...run, difficulty: 4, letter: 'F' })).toBe(160);
  });

  it('scales runs ended early and pays nothing under 10 days', () => {
    expect(runXp({ ...run, days: 30, complete: false })).toBe(Math.round(140 * (30 / 61)));
    expect(runXp({ ...run, days: 9, complete: false })).toBe(0);
  });
});

describe('progress', () => {
  const result: RunResult = {
    scenarioId: 'first-steps',
    scenarioName: 'First steps',
    runKey: 'first-steps:7',
    difficulty: 1,
    letter: 'B',
    score: 76,
    days: 61,
    totalDays: 61,
    complete: true,
  };

  it('pays run XP plus a first-finish bonus once', () => {
    const a = finishRun(emptyProgress(), result);
    expect(a.rewards.map((r) => [r.source, r.xp])).toEqual([
      ['run', 140],
      ['firstFinish', 100],
    ]);
    expect(a.progress.xp).toBe(240);
    expect(a.progress.finished['first-steps']).toBe(1);
    expect(a.progress.bestGrade['first-steps']).toEqual({ letter: 'B', score: 76 });
    const other = finishRun(a.progress, { ...result, runKey: 'first-steps:8' });
    expect(other.rewards.map((r) => r.source)).toEqual(['run']);
  });

  it('pays a replay of the same market only for beating its best', () => {
    const a = finishRun(emptyProgress(), result).progress;
    const same = finishRun(a, result);
    expect(same.rewards).toEqual([]);
    expect(same.progress.xp).toBe(a.xp);
    const better = finishRun(a, { ...result, letter: 'A', score: 91 });
    expect(better.rewards).toEqual([
      { source: 'run', label: 'First steps: beat your best', xp: 60 },
    ]);
    expect(better.progress.bestXp['first-steps:7']).toBe(200);
    expect(better.progress.bestGrade['first-steps']?.letter).toBe('A');
    // Worse later: nothing, and the best stays.
    const worse = finishRun(better.progress, { ...result, letter: 'C', score: 61 });
    expect(worse.rewards).toEqual([]);
    expect(worse.progress.bestXp['first-steps:7']).toBe(200);
  });

  it('a run ended early does not count as finished', () => {
    const a = finishRun(emptyProgress(), { ...result, days: 30, complete: false });
    expect(a.rewards.map((r) => r.source)).toEqual(['run']);
    expect(a.progress.finished['first-steps']).toBeUndefined();
  });

  it('migrates missing or broken saves', () => {
    expect(migrate(undefined)).toEqual(emptyProgress());
    expect(migrate('junk')).toEqual(emptyProgress());
    const m = migrate({
      version: 0,
      xp: 1234.7,
      badges: { 'first-trade': '2026-11-16' },
      glossarySeen: ['spread', 3],
      streak: null,
    });
    expect(m.xp).toBe(1234);
    expect(m.badges).toEqual({ 'first-trade': '2026-11-16' });
    expect(m.glossarySeen).toEqual(['spread']);
    expect(m.streak).toEqual(emptyProgress().streak);
    expect(m.version).toBe(1);
  });
});
