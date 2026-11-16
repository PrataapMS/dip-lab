import { describe, expect, it } from 'vitest';
import { longDate, MINUS, money, price, shares, signedMoney, signedPct, weekdayShort } from './format';

describe('format', () => {
  it('always signs moves', () => {
    expect(signedPct(0.0123)).toBe('+1.23%');
    expect(signedPct(-0.0123)).toBe(`${MINUS}1.23%`);
    expect(signedPct(0)).toBe('+0.00%');
    expect(signedMoney(482.2)).toBe('+$482');
    expect(signedMoney(-12.4, true)).toBe(`${MINUS}$12.40`);
    expect(signedMoney(-0.001, true)).toBe('+$0.00');
  });

  it('formats prices, money, shares and dates', () => {
    expect(price(1234.5)).toBe('1,234.50');
    expect(money(10_482.4)).toBe('$10,482');
    expect(money(812.4, true)).toBe('$812.40');
    expect(money(-5)).toBe(`${MINUS}$5`);
    expect(shares(10.371234)).toBe('10.3712');
    expect(shares(3)).toBe('3');
    expect(longDate('2020-03-23')).toBe('Mon 23 Mar 2020');
    expect(weekdayShort('2020-03-24')).toBe('tue');
  });
});
