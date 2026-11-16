import { describe, expect, it } from 'vitest';
import { longDate, MINUS, price, signedPct } from './format';

describe('format', () => {
  it('always signs moves', () => {
    expect(signedPct(0.0123)).toBe('+1.23%');
    expect(signedPct(-0.0123)).toBe(`${MINUS}1.23%`);
    expect(signedPct(0)).toBe('+0.00%');
  });

  it('formats prices and dates', () => {
    expect(price(1234.5)).toBe('1,234.50');
    expect(longDate('2020-03-23')).toBe('Mon 23 Mar 2020');
  });
});
