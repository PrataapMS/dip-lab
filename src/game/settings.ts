import { SLOW_DAY_LENGTHS, SPEEDS } from '../engine/clock';
import { DEFAULT_REMINDER_HOUR, REMINDER_HOURS } from './reminders';
import { cleanWatchlist, DEFAULT_WATCHLIST } from './watchlist';

/**
 * Device settings: one small record next to progress (store `progress`, key `settings`), so
 * resetting progress leaves them alone. Pure: the UI loads and saves it.
 */

export const SETTINGS_VERSION = 1;

/** Stop the clock at each close: auto = only for runs up to 70 days (the engine's default). */
export type PauseRule = 'auto' | 'always' | 'never';

export interface Settings {
  version: number;
  /** Real time per trading day, for new runs (and the current one when changed). */
  dayLengthMs: number;
  pauseAtClose: PauseRule;
  sound: boolean;
  /** The install card on Home was closed; from then on install lives in Settings only. */
  installDismissed: boolean;
  /** The player's watchlist, the same in every run. */
  watchlist: string[];
  /** Streak reminders as system notifications (off until the player turns them on). */
  reminders: boolean;
  /** Local hour for reminders, one of `REMINDER_HOURS`. */
  reminderHour: number;
  /** The Home card asking to turn reminders on was closed. */
  reminderOfferDismissed: boolean;
}

export interface DayLength {
  id: string;
  label: string;
  ms: number;
  /** Shown as a speed chip on the Market screen. */
  chip: boolean;
}

export const DAY_LENGTHS: readonly DayLength[] = [
  { id: '1x', label: '1x · 60 s a day', ms: SPEEDS['1x'], chip: true },
  { id: '2x', label: '2x · 30 s a day', ms: SPEEDS['2x'], chip: true },
  { id: '4x', label: '4x · 15 s a day', ms: SPEEDS['4x'], chip: true },
  { id: '8x', label: '8x · 7.5 s a day', ms: SPEEDS['8x'], chip: true },
  { id: '5m', label: '5 min a day', ms: SLOW_DAY_LENGTHS['5m'], chip: false },
  { id: 'real', label: 'Real time · 6.5 h a day', ms: SLOW_DAY_LENGTHS.real, chip: false },
];

export function dayLengthOf(ms: number): DayLength | undefined {
  return DAY_LENGTHS.find((d) => d.ms === ms);
}

export function defaultSettings(): Settings {
  return {
    version: SETTINGS_VERSION,
    dayLengthMs: SPEEDS['2x'],
    pauseAtClose: 'auto',
    sound: true,
    installDismissed: false,
    watchlist: [...DEFAULT_WATCHLIST],
    reminders: false,
    reminderHour: DEFAULT_REMINDER_HOUR,
    reminderOfferDismissed: false,
  };
}

/** Accept whatever was saved (older, partial or broken records) and fill the gaps. */
export function migrateSettings(saved: unknown): Settings {
  const base = defaultSettings();
  if (!saved || typeof saved !== 'object') return base;
  const s = saved as Partial<Settings>;
  return {
    version: SETTINGS_VERSION,
    dayLengthMs:
      typeof s.dayLengthMs === 'number' && dayLengthOf(s.dayLengthMs)
        ? s.dayLengthMs
        : base.dayLengthMs,
    pauseAtClose:
      s.pauseAtClose === 'always' || s.pauseAtClose === 'never' || s.pauseAtClose === 'auto'
        ? s.pauseAtClose
        : base.pauseAtClose,
    sound: typeof s.sound === 'boolean' ? s.sound : base.sound,
    installDismissed: s.installDismissed === true,
    watchlist: cleanWatchlist(s.watchlist) ?? base.watchlist,
    reminders: s.reminders === true,
    reminderHour: REMINDER_HOURS.some((h) => h.value === s.reminderHour)
      ? (s.reminderHour as number)
      : base.reminderHour,
    reminderOfferDismissed: s.reminderOfferDismissed === true,
  };
}

/** The run option for a rule: undefined leaves it to the engine (auto). */
export function pauseAtCloseFor(rule: PauseRule): boolean | undefined {
  return rule === 'auto' ? undefined : rule === 'always';
}

export const NAME_MAX = 16;

/** A player name, trimmed, or a plain reason it can't be used. */
export function checkName(raw: string): { name: string } | { error: string } {
  const name = raw.trim();
  if (!name) return { error: 'Pick a name with at least one character.' };
  if (name.length > NAME_MAX) return { error: `Keep it to ${NAME_MAX} characters or fewer.` };
  if (!/^[A-Za-z0-9_-]+$/.test(name))
    return { error: 'Use letters, digits, _ and - only (like player_one).' };
  return { name };
}
