import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { questsFor } from './quests';
import {
  addDays,
  cleanShown,
  dueReminder,
  localTime,
  markShown,
  nextReminderAt,
  PLAN_KEY,
  planReminders,
  REMINDER_TAG,
  SHOWN_KEY,
  SHOWN_MAX,
  shouldOfferReminders,
} from './reminders';

const streak = { count: 5, best: 9, last: '2026-11-17' };

describe('planReminders', () => {
  it('plans nothing before the first day played', () => {
    expect(planReminders({ count: 0, best: 0, last: null }, 19)).toEqual([]);
  });

  it('nudges the day the streak would end, the day after, and a week later', () => {
    const plan = planReminders(streak, 19);
    expect(plan.map((r) => r.id)).toEqual([
      'risk:2026-11-18',
      'lapsed:2026-11-19',
      'comeback:2026-11-24',
    ]);
    expect(plan[0]).toMatchObject({
      at: localTime('2026-11-18', 19),
      until: localTime('2026-11-19', 0),
      title: 'Your 5-day streak ends at midnight',
    });
    expect(plan[1]?.title).toBe('Your 5-day streak has ended');
    expect(plan[1]?.body).toContain('Best so far: 9 days.');
  });

  it('adds the day’s learning quest to every reminder', () => {
    const q = questsFor('2026-11-18')[0];
    expect(planReminders(streak, 9)[0]?.body).toContain(
      `Today's quest: ${q?.text} (+${q?.xp} XP).`,
    );
  });

  it('words a one-day streak as a goal, not a loss', () => {
    const plan = planReminders({ count: 1, best: 1, last: '2026-11-17' }, 12);
    expect(plan[0]?.title).toBe('Day 2 of your streak is waiting');
    expect(plan[0]?.body).toContain('to reach it.');
    expect(plan[1]?.title).toBe('Start a new streak today');
    expect(plan[1]?.body).toContain('Best so far: 1 day.');
    expect(plan[0]?.at).toBe(localTime('2026-11-18', 12));
  });

  it('crosses month and year ends', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(planReminders({ ...streak, last: '2026-12-30' }, 19).map((r) => r.id)).toEqual([
      'risk:2026-12-31',
      'lapsed:2027-01-01',
      'comeback:2027-01-06',
    ]);
  });
});

describe('dueReminder', () => {
  const plan = planReminders(streak, 19);
  const [risk, lapsed] = plan;

  it('shows nothing before the hour, then the reminder until midnight', () => {
    expect(dueReminder(plan, [], localTime('2026-11-18', 18))).toBeNull();
    expect(dueReminder(plan, [], localTime('2026-11-18', 19))).toBe(risk);
    expect(dueReminder(plan, [], localTime('2026-11-18', 23) + 59 * 60_000)).toBe(risk);
    expect(dueReminder(plan, [], localTime('2026-11-19', 0) + 1)).toBeNull();
  });

  it('shows each reminder once and skips stale ones', () => {
    expect(dueReminder(plan, [risk?.id ?? ''], localTime('2026-11-18', 20))).toBeNull();
    // Woken late on day 2: the risk reminder is stale, the lapsed one is due.
    expect(dueReminder(plan, [], localTime('2026-11-19', 21))).toBe(lapsed);
  });

  it('finds when the next one is due', () => {
    expect(nextReminderAt(plan, localTime('2026-11-17', 12))).toBe(risk?.at);
    expect(nextReminderAt(plan, localTime('2026-11-18', 20))).toBe(lapsed?.at);
    expect(nextReminderAt(plan, localTime('2026-12-01', 0))).toBeNull();
  });

  it('keeps a short list of shown ids', () => {
    let shown: string[] = [];
    for (let k = 0; k < SHOWN_MAX + 5; k++) shown = markShown(shown, `r:${k}`);
    expect(shown).toHaveLength(SHOWN_MAX);
    expect(shown.at(-1)).toBe(`r:${SHOWN_MAX + 4}`);
    expect(markShown(['a', 'b'], 'a')).toEqual(['b', 'a']);
    expect(cleanShown(['a', 3, null])).toEqual(['a']);
    expect(cleanShown('x')).toEqual([]);
  });
});

describe('shouldOfferReminders', () => {
  const base = {
    streak: 2,
    enabled: false,
    dismissed: false,
    supported: true,
    permission: 'default' as const,
  };

  it('asks once a streak has started, if notifications can work', () => {
    expect(shouldOfferReminders(base)).toBe(true);
    expect(shouldOfferReminders({ ...base, permission: 'granted' })).toBe(true);
    expect(shouldOfferReminders({ ...base, streak: 1 })).toBe(false);
    expect(shouldOfferReminders({ ...base, enabled: true })).toBe(false);
    expect(shouldOfferReminders({ ...base, dismissed: true })).toBe(false);
    expect(shouldOfferReminders({ ...base, supported: false, permission: null })).toBe(false);
    expect(shouldOfferReminders({ ...base, permission: 'denied' })).toBe(false);
  });
});

describe('service worker script', () => {
  it('uses the same tag and records as the app', () => {
    const sw = readFileSync(join(import.meta.dirname, '../../public/sw-reminders.js'), 'utf8');
    expect(sw).toContain(`'${REMINDER_TAG}'`);
    expect(sw).toContain(`'${PLAN_KEY}'`);
    expect(sw).toContain(`'${SHOWN_KEY}'`);
    expect(sw).toContain(`${SHOWN_MAX}`);
  });
});
