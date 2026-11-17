import { describe, expect, it } from 'vitest';
import { SLOW_DAY_LENGTHS, SPEEDS } from '../engine/clock';
import {
  checkName,
  DAY_LENGTHS,
  dayLengthOf,
  defaultSettings,
  migrateSettings,
  pauseAtCloseFor,
} from './settings';

describe('settings', () => {
  it('defaults: 2x, auto pause, sound on', () => {
    expect(defaultSettings()).toMatchObject({
      dayLengthMs: SPEEDS['2x'],
      pauseAtClose: 'auto',
      sound: true,
      installDismissed: false,
    });
  });

  it('migrates partial and broken records', () => {
    expect(migrateSettings(null)).toEqual(defaultSettings());
    expect(migrateSettings('x')).toEqual(defaultSettings());
    expect(migrateSettings({ dayLengthMs: 123, pauseAtClose: 'sometimes', sound: 'yes' })).toEqual(
      defaultSettings(),
    );
    expect(
      migrateSettings({ dayLengthMs: SLOW_DAY_LENGTHS.real, pauseAtClose: 'never', sound: false }),
    ).toMatchObject({ dayLengthMs: SLOW_DAY_LENGTHS.real, pauseAtClose: 'never', sound: false });
    // Records from before the watchlist was editable get the default list.
    expect(migrateSettings({ sound: true }).watchlist).toEqual(defaultSettings().watchlist);
    expect(migrateSettings({ watchlist: ['KO', 'KO', 'nope'] }).watchlist).toEqual(['KO']);
    expect(migrateSettings({ watchlist: [] }).watchlist).toEqual([]);
    // Reminders stay off for older records; unknown hours fall back to 7 pm.
    expect(migrateSettings({ sound: true })).toMatchObject({
      reminders: false,
      reminderHour: 19,
      reminderOfferDismissed: false,
    });
    expect(migrateSettings({ reminders: true, reminderHour: 9 })).toMatchObject({
      reminders: true,
      reminderHour: 9,
    });
    expect(migrateSettings({ reminders: 'yes', reminderHour: 3 })).toMatchObject({
      reminders: false,
      reminderHour: 19,
    });
  });

  it('offers every speed chip plus 5 min and real time', () => {
    expect(DAY_LENGTHS.map((d) => d.id)).toEqual(['1x', '2x', '4x', '8x', '5m', 'real']);
    expect(dayLengthOf(SLOW_DAY_LENGTHS['5m'])?.chip).toBe(false);
    expect(dayLengthOf(SPEEDS['8x'])?.chip).toBe(true);
  });

  it('maps the pause rule to a run option', () => {
    expect(pauseAtCloseFor('auto')).toBeUndefined();
    expect(pauseAtCloseFor('always')).toBe(true);
    expect(pauseAtCloseFor('never')).toBe(false);
  });

  it('checks player names', () => {
    expect(checkName('  trader_42 ')).toEqual({ name: 'trader_42' });
    expect(checkName('')).toHaveProperty('error');
    expect(checkName('a'.repeat(17))).toHaveProperty('error');
    expect(checkName('no spaces')).toHaveProperty('error');
    expect(checkName('<b>')).toHaveProperty('error');
  });
});
