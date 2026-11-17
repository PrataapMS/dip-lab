import { questsFor } from './quests';
import type { Streak } from './streak';

/**
 * Streak reminders. Pure: from the streak and the chosen hour, plan the few system
 * notifications that may follow the last day played. The UI stores the plan (store `progress`,
 * key `reminders`) and the service worker (public/sw-reminders.js) shows the one that is due
 * when the browser wakes it, so nothing needs a server.
 *
 * At most three nudges per lapse, then silence: the day the streak would end, the day after it
 * ended, and a week after the last day played. Playing again replans from that day.
 */

/** Shared with public/sw-reminders.js: notification tag and periodic sync tag. */
export const REMINDER_TAG = 'dip-lab-reminder';
/** Records in store `progress`, shared with public/sw-reminders.js. */
export const PLAN_KEY = 'reminders';
export const SHOWN_KEY = 'reminderShown';
/** How many shown ids to remember (only the latest few can still be due). */
export const SHOWN_MAX = 10;

export const REMINDER_HOURS: readonly { value: number; label: string }[] = [
  { value: 9, label: '9 am' },
  { value: 12, label: 'Noon' },
  { value: 19, label: '7 pm' },
  { value: 21, label: '9 pm' },
];
export const DEFAULT_REMINDER_HOUR = 19;

export interface Reminder {
  /** `<kind>:<date>`, so a reminder is shown once even if planned again. */
  id: string;
  /** Show from this local time (epoch ms)… */
  at: number;
  /** …until this one: past it the reminder is stale and skipped. */
  until: number;
  title: string;
  body: string;
}

export interface ReminderPlan {
  version: 1;
  items: Reminder[];
}

function parts(date: string): [number, number, number] {
  const [y, m, d] = date.split('-').map(Number);
  return [y ?? 1970, (m ?? 1) - 1, d ?? 1];
}

/** The `YYYY-MM-DD` date `n` days after `date`. */
export function addDays(date: string, n: number): string {
  const [y, m, d] = parts(date);
  return new Date(Date.UTC(y, m, d + n)).toISOString().slice(0, 10);
}

/** Epoch ms of `hour`:00 local time on `date`. */
export function localTime(date: string, hour: number): number {
  const [y, m, d] = parts(date);
  return new Date(y, m, d, hour).getTime();
}

function questLine(date: string): string {
  // The learning quest: the quickest one to finish from a notification.
  const q = questsFor(date)[0];
  return q ? ` Today's quest: ${q.text} (+${q.xp} XP).` : '';
}

/** The reminders that follow the last day played, in time order. Empty before any play. */
export function planReminders(streak: Streak, hour: number): Reminder[] {
  if (!streak.last) return [];
  const make = (kind: string, offset: number, title: string, body: string): Reminder => {
    const date = addDays(streak.last as string, offset);
    return {
      id: `${kind}:${date}`,
      at: localTime(date, hour),
      until: localTime(addDays(date, 1), 0),
      title,
      body: body + questLine(date),
    };
  };
  const n = streak.count;
  const play = 'Play one market day or finish a lesson before midnight';
  return [
    n >= 2
      ? make('risk', 1, `Your ${n}-day streak ends at midnight`, `${play} to keep it.`)
      : make('risk', 1, 'Day 2 of your streak is waiting', `${play} to reach it.`),
    make(
      'lapsed',
      2,
      n >= 2 ? `Your ${n}-day streak has ended` : 'Start a new streak today',
      `Best so far: ${streak.best} ${streak.best === 1 ? 'day' : 'days'}. One market day or a lesson starts a new one.`,
    ),
    make(
      'comeback',
      7,
      'Your daily quests are waiting',
      'Saved runs pick up right where you paused them.',
    ),
  ];
}

/** The newest reminder due at `now` that hasn't been shown. Mirrored in public/sw-reminders.js. */
export function dueReminder(
  items: readonly Reminder[],
  shown: readonly string[],
  now: number,
): Reminder | null {
  let due: Reminder | null = null;
  for (const r of items) if (r.at <= now && now < r.until && !shown.includes(r.id)) due = r;
  return due;
}

/** When the next reminder becomes due after `now`, or null if none is left. */
export function nextReminderAt(items: readonly Reminder[], now: number): number | null {
  const next = items.find((r) => r.at > now);
  return next ? next.at : null;
}

/** Remember a shown id, keeping the list short. */
export function markShown(shown: readonly string[], id: string): string[] {
  return [...shown.filter((s) => s !== id), id].slice(-SHOWN_MAX);
}

/** A stored list of shown ids, or empty if broken. */
export function cleanShown(saved: unknown): string[] {
  return Array.isArray(saved) ? saved.filter((s): s is string => typeof s === 'string') : [];
}

/** Whether a Home card should ask to turn reminders on. */
export function shouldOfferReminders(o: {
  streak: number;
  enabled: boolean;
  dismissed: boolean;
  supported: boolean;
  permission: NotificationPermission | null;
}): boolean {
  return o.streak >= 2 && !o.enabled && !o.dismissed && o.supported && o.permission !== 'denied';
}
