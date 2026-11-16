import { describe, expect, it } from 'vitest';
import { UNIVERSE } from '../data/universe';
import { debrief } from '../engine/debrief';
import { buildMarket } from '../engine/market';
import { Run } from '../engine/run';
import { getScenario, SCENARIOS } from '../engine/scenarios';
import { completeLesson, emptyProgress, finishChallenge } from '../game/progress';
import { challengeById, CHALLENGES } from './challenges';
import { GLOSSARY } from './glossary';
import { LESSONS, lessonById } from './lessons';

describe('lessons', () => {
  it('has 12 lessons of 3 to 5 cards, each with one right answer', () => {
    expect(LESSONS).toHaveLength(12);
    expect(new Set(LESSONS.map((l) => l.id)).size).toBe(12);
    for (const l of LESSONS) {
      expect(l.cards.length).toBeGreaterThanOrEqual(3);
      expect(l.cards.length).toBeLessThanOrEqual(5);
      expect(l.check.options.length).toBeGreaterThanOrEqual(2);
      expect(new Set(l.check.options).size).toBe(l.check.options.length);
      expect(l.check.options[l.check.answer]).toBeDefined();
      expect(JSON.stringify(l)).not.toMatch(/—/);
      if (l.tryIt) expect(SCENARIOS.map((s) => s.id)).toContain(l.tryIt);
    }
  });

  it('every lesson the glossary points to exists', () => {
    for (const g of GLOSSARY)
      if (g.lesson) expect(lessonById(g.lesson), `${g.id} → ${g.lesson}`).toBeDefined();
  });

  it('pays XP once and counts for the streak and quests', () => {
    const lesson = LESSONS[0];
    if (!lesson) throw new Error('no lessons');
    const a = completeLesson(emptyProgress(), lesson, '2026-11-16', { lessonCount: 12 });
    expect(a.rewards[0]).toEqual({
      source: 'lesson',
      label: `Lesson: ${lesson.title}`,
      xp: 25,
      id: lesson.id,
    });
    expect(a.progress.lessons[lesson.id]).toBe(true);
    expect(a.progress.streak.count).toBe(1);
    const again = completeLesson(a.progress, lesson, '2026-11-16', { lessonCount: 12 });
    expect(again.rewards.filter((r) => r.source === 'lesson')).toEqual([]);
  });
});

describe('challenges', () => {
  it('have unique ids and fixed seeds on real scenarios', () => {
    expect(CHALLENGES.length).toBeGreaterThanOrEqual(8);
    expect(new Set(CHALLENGES.map((c) => c.id)).size).toBe(CHALLENGES.length);
    expect(new Set(CHALLENGES.map((c) => c.seed)).size).toBe(CHALLENGES.length);
    for (const c of CHALLENGES) {
      expect(SCENARIOS.map((s) => s.id)).toContain(c.scenarioId);
      expect(c.xp).toBeGreaterThanOrEqual(150);
      expect(c.xp).toBeLessThanOrEqual(300);
      expect(c.goal).not.toMatch(/—/);
    }
  });

  it('checks goals from the debrief', () => {
    const c = challengeById('first-ahead');
    if (!c) throw new Error('missing');
    const market = buildMarket(getScenario(c.scenarioId), c.seed, UNIVERSE);
    const run = new Run(market, undefined, undefined, { pauseAtClose: false });
    run.place({
      ticker: 'SPY',
      side: 'buy',
      type: 'market',
      amount: { kind: 'dollars', value: 9_000 },
    });
    while (!run.finished) run.stepDay();
    const d = debrief(run);
    expect(c.passed({ ...d, excessPts: 0.5 })).toBe(true);
    expect(c.passed({ ...d, excessPts: -0.5 })).toBe(false);
    const spread = challengeById('dotcom-spread');
    expect(
      spread?.passed({ ...d, excessPts: 1, maxWeight: { ticker: 'CSCO', weight: 0.25, day: 3 } }),
    ).toBe(false);
    expect(spread?.passed({ ...d, excessPts: 1, maxWeight: null })).toBe(true);
    const held = challengeById('earnings-spread');
    expect(held?.passed({ ...d, ret: 0.02, endHoldings: 5 })).toBe(true);
    expect(held?.passed({ ...d, ret: 0.02, endHoldings: 4 })).toBe(false);
    expect(d.endHoldings).toBe(1);
  });

  it('pays the first pass only and keeps the best grade', () => {
    const c = { id: 'x', title: 'X', xp: 200 };
    const fail = finishChallenge(emptyProgress(), c, { passed: false, letter: 'B', score: 76 });
    expect(fail.rewards).toEqual([]);
    const pass = finishChallenge(emptyProgress(), c, { passed: true, letter: 'B', score: 76 });
    expect(pass.rewards.map((r) => r.xp)).toEqual([200]);
    const better = finishChallenge(pass.progress, c, { passed: true, letter: 'A', score: 91 });
    expect(better.rewards).toEqual([]);
    expect(better.progress.challenges.x).toEqual({ letter: 'A', score: 91 });
    const worse = finishChallenge(better.progress, c, { passed: true, letter: 'C', score: 61 });
    expect(worse.progress.challenges.x?.letter).toBe('A');
  });
});
