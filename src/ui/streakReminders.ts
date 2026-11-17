import { useEffect } from 'preact/hooks';
import {
  cleanShown,
  dueReminder,
  markShown,
  nextReminderAt,
  PLAN_KEY,
  planReminders,
  REMINDER_TAG,
  type Reminder,
  type ReminderPlan,
  SHOWN_KEY,
} from '../game/reminders';
import type { Streak } from '../game/streak';
import { load, save } from '../storage/db';
import { registerPeriodic } from './updates';

/**
 * Streak reminders in the browser. The plan goes to IndexedDB for the service worker
 * (public/sw-reminders.js), which shows it when Chrome wakes an installed app. While a tab is
 * open in the background, a timer here shows it on time instead.
 */

/** Ask Chrome to wake the worker this often; it decides the real interval (often longer). */
export const REMINDER_SYNC_MS = 4 * 60 * 60 * 1000;
/** setTimeout's longest delay. */
const MAX_DELAY = 2 ** 31 - 1;

/** The notification permission, or null when this browser can't show notifications. */
export function notificationPermission(): NotificationPermission | null {
  return typeof Notification !== 'undefined' && 'serviceWorker' in navigator
    ? Notification.permission
    : null;
}

async function show(r: Pick<Reminder, 'title' | 'body'>): Promise<void> {
  const icon = `${import.meta.env.BASE_URL}icon-192.png`;
  const options = { body: r.body, icon, badge: icon, tag: REMINDER_TAG };
  const reg = await navigator.serviceWorker.getRegistration().catch(() => undefined);
  if (reg) return reg.showNotification(r.title, options);
  // No service worker (dev server): a plain page notification.
  const n = new Notification(r.title, options);
  n.onclick = () => {
    window.focus();
    n.close();
  };
}

/** Ask for permission if needed, then for background wake-ups. */
export async function enableReminders(): Promise<NotificationPermission | null> {
  if (notificationPermission() === null) return null;
  const permission =
    Notification.permission === 'default'
      ? await Notification.requestPermission()
      : Notification.permission;
  if (permission === 'granted') {
    const reg = await navigator.serviceWorker.getRegistration().catch(() => undefined);
    if (reg) await registerPeriodic(reg, REMINDER_TAG, REMINDER_SYNC_MS);
  }
  return permission;
}

export function sendTestReminder(): Promise<void> {
  return show({
    title: 'Dip Lab reminders are on',
    body: 'You will get a nudge like this when your streak is about to end.',
  });
}

/** Show the reminder due now, once, and only while the app is out of sight. */
async function showDue(items: Reminder[]): Promise<void> {
  if (document.visibilityState !== 'hidden') return;
  const shown = cleanShown(await load('progress', SHOWN_KEY));
  const due = dueReminder(items, shown, Date.now());
  if (!due) return;
  await save('progress', SHOWN_KEY, markShown(shown, due.id));
  await show(due).catch(() => {});
}

/** Keep the stored plan in step with the streak and settings, and time reminders while open. */
export function useReminders(
  streak: Streak | undefined,
  enabled: boolean | undefined,
  hour: number | undefined,
): void {
  const last = streak?.last;
  const count = streak?.count;
  const best = streak?.best;
  useEffect(() => {
    if (last === undefined || count === undefined || best === undefined || hour === undefined)
      return;
    const on = !!enabled && notificationPermission() === 'granted';
    const items = on ? planReminders({ last, count, best }, hour) : [];
    const plan: ReminderPlan = { version: 1, items };
    void save('progress', PLAN_KEY, plan);
    if (!items.length) return;
    void navigator.serviceWorker
      .getRegistration()
      .then((reg) => reg && registerPeriodic(reg, REMINDER_TAG, REMINDER_SYNC_MS))
      .catch(() => {});
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      const at = nextReminderAt(items, Date.now());
      if (at === null) return;
      timer = setTimeout(
        () => {
          void showDue(items);
          arm();
        },
        Math.min(at - Date.now(), MAX_DELAY),
      );
    };
    arm();
    return () => clearTimeout(timer);
  }, [last, count, best, enabled, hour]);
}
