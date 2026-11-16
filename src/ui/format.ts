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

function isZero(formatted: string): boolean {
  return Number(formatted.replace(/[$,]/g, '')) === 0;
}

/** "$10,482" (whole dollars) or "$812.40" with `cents`. */
export function money(value: number, cents = false): string {
  const digits = cents ? 2 : 0;
  const s = `$${Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
  return value < 0 && !isZero(s) ? `${MINUS}${s}` : s;
}

/** "+$482" or "−$12.40": signed like percentages. */
export function signedMoney(value: number, cents = false): string {
  const s = money(Math.abs(value), cents);
  return `${value < 0 && !isZero(s) ? MINUS : '+'}${s}`;
}

/** Shares with up to 4 decimals and no trailing zeros: "10.3712", "3". */
export function shares(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: 4 });
}

/** Lower-case three-letter weekday, e.g. "tue". */
export function weekdayShort(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return '';
  return ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date(Date.UTC(y, m - 1, d)).getUTCDay()] ?? '';
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Feb–Dec 2020", "Oct 2007–Mar 2009" or "2010–2019" for whole years. */
export function dateRange(start: string, end: string): string {
  const [y0, m0] = start.split('-').map(Number);
  const [y1, m1] = end.split('-').map(Number);
  if (!y0 || !m0 || !y1 || !m1) return `${start}–${end}`;
  if (m0 === 1 && m1 === 12 && y1 > y0) return `${y0}–${y1}`;
  if (y0 === y1) return m0 === m1 ? `${MONTHS[m0 - 1]} ${y0}` : `${MONTHS[m0 - 1]}–${MONTHS[m1 - 1]} ${y0}`;
  return `${MONTHS[m0 - 1]} ${y0}–${MONTHS[m1 - 1]} ${y1}`;
}
