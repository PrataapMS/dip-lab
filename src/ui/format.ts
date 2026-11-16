/** Minus sign used for losses (typographic, not a hyphen). */
export const MINUS = '−';

/** "+1.23%" or "−1.23%": every move carries a sign as well as a colour. */
export function signedPct(fraction: number, digits = 2): string {
  const pct = fraction * 100;
  const sign = pct > 0 || Object.is(pct, 0) ? '+' : MINUS;
  return `${sign}${Math.abs(pct).toFixed(digits)}%`;
}

export function price(value: number): string {
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** "Mon 23 Mar 2020" from an ISO date, without Date parsing quirks. */
export function longDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${days[wd]} ${d} ${months[m - 1]} ${y}`;
}

export function upDown(fraction: number): 'up' | 'down' {
  return fraction >= 0 ? 'up' : 'down';
}
