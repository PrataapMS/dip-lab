import { describe, expect, it } from 'vitest';
import { isIos, showInstallCard } from './install';

describe('install prompt', () => {
  const chrome = { installed: false, canPrompt: true, ios: false };
  it('waits for the first finished run', () => {
    expect(showInstallCard(chrome, 0, false)).toBe(false);
    expect(showInstallCard(chrome, 1, false)).toBe(true);
  });

  it('never shows once dismissed or installed, or where it cannot install', () => {
    expect(showInstallCard(chrome, 3, true)).toBe(false);
    expect(showInstallCard({ ...chrome, installed: true }, 3, false)).toBe(false);
    expect(showInstallCard({ ...chrome, canPrompt: false }, 3, false)).toBe(false);
    expect(showInstallCard({ installed: false, canPrompt: false, ios: true }, 1, false)).toBe(true);
  });

  it('spots iPhones and iPads', () => {
    expect(isIos('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 'iPhone', 5)).toBe(true);
    expect(isIos('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 5)).toBe(true);
    expect(isIos('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 0)).toBe(false);
    expect(isIos('Mozilla/5.0 (Linux; Android 15)', 'Linux armv8l', 5)).toBe(false);
  });
});
