import { describe, expect, it } from 'vitest';
import { canOfferAlerts } from './updates';

describe('canOfferAlerts', () => {
  const base = { notifications: true, permission: 'default', installed: true } as const;

  it('offers alerts on an installed app that has not been asked yet', () => {
    expect(canOfferAlerts(base)).toBe(true);
  });

  it('stays quiet in a browser tab, once answered, or without notification support', () => {
    expect(canOfferAlerts({ ...base, installed: false })).toBe(false);
    expect(canOfferAlerts({ ...base, permission: 'granted' })).toBe(false);
    expect(canOfferAlerts({ ...base, permission: 'denied' })).toBe(false);
    expect(canOfferAlerts({ ...base, notifications: false, permission: null })).toBe(false);
  });
});
