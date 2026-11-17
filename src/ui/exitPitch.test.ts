import { describe, expect, it } from 'vitest';
import { type ExitContext, exitPitch } from './exitPitch';

const base: ExitContext = { streak: 0, playedToday: false, questsLeft: 0, runOpen: false };

describe('exit pitch', () => {
  it('warns about a streak that lapses tonight first', () => {
    const p = exitPitch({ ...base, streak: 4, questsLeft: 3, runOpen: true });
    expect(p.kind).toBe('streakRisk');
    expect(p.title).toContain('4-day');
  });

  it('then points at open quests, with a singular for one', () => {
    expect(exitPitch({ ...base, streak: 4, playedToday: true, questsLeft: 2 }).kind).toBe('quests');
    expect(exitPitch({ ...base, questsLeft: 1 }).title).toBe('1 quest still open today');
  });

  it('celebrates a streak already kept today', () => {
    expect(exitPitch({ ...base, streak: 3, playedToday: true }).kind).toBe('streakSafe');
    expect(exitPitch({ ...base, streak: 1, playedToday: true }).kind).toBe('plain');
  });

  it('mentions an open run, else says a plain goodbye', () => {
    expect(exitPitch({ ...base, runOpen: true }).kind).toBe('run');
    expect(exitPitch(base).kind).toBe('plain');
  });
});
