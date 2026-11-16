/**
 * NYSE trading calendar, computed from rules (no Date objects, so it is exact and
 * timezone-free). Dates are ISO strings "YYYY-MM-DD"; internally they are day numbers
 * counted from 1970-01-01.
 */
export type IsoDate = string;

/** Days since 1970-01-01 for a proleptic Gregorian date (Howard Hinnant's algorithm). */
export function daysFromCivil(y: number, m: number, d: number): number {
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

export function civilFromDays(z: number): [number, number, number] {
  const zz = z + 719468;
  const era = Math.floor(zz / 146097);
  const doe = zz - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  return [yoe + era * 400 + (m <= 2 ? 1 : 0), m, d];
}

/** 0 = Sunday ... 6 = Saturday. */
export function weekday(dayNumber: number): number {
  return (((dayNumber + 4) % 7) + 7) % 7;
}

export function toDayNumber(iso: IsoDate): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) throw new Error(`Not an ISO date: ${iso}`);
  return daysFromCivil(Number(match[1]), Number(match[2]), Number(match[3]));
}

export function fromDayNumber(n: number): IsoDate {
  const [y, m, d] = civilFromDays(n);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** The nth (1-based) given weekday of a month. */
function nthWeekday(y: number, m: number, wd: number, n: number): number {
  const first = daysFromCivil(y, m, 1);
  return first + ((wd - weekday(first) + 7) % 7) + (n - 1) * 7;
}

function lastWeekday(y: number, m: number, wd: number): number {
  const nextMonth = m === 12 ? daysFromCivil(y + 1, 1, 1) : daysFromCivil(y, m + 1, 1);
  const last = nextMonth - 1;
  return last - ((weekday(last) - wd + 7) % 7);
}

/** Saturday holidays move to Friday, Sunday holidays to Monday. */
function observed(day: number): number {
  const wd = weekday(day);
  if (wd === 6) return day - 1;
  if (wd === 0) return day + 1;
  return day;
}

/** Easter Sunday (anonymous Gregorian algorithm). */
function easter(y: number): number {
  const a = y % 19;
  const b = Math.floor(y / 100);
  const c = y % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return daysFromCivil(y, month, day);
}

/** Unscheduled closures: weather, national mourning, September 11. */
const SPECIAL_CLOSURES: readonly IsoDate[] = [
  '1985-09-27', // Hurricane Gloria
  '1994-04-27', // President Nixon's funeral
  '2001-09-11',
  '2001-09-12',
  '2001-09-13',
  '2001-09-14',
  '2004-06-11', // President Reagan's funeral
  '2007-01-02', // President Ford's funeral
  '2012-10-29', // Hurricane Sandy
  '2012-10-30',
  '2018-12-05', // President G.H.W. Bush's funeral
  '2025-01-09', // President Carter's funeral
];
const SPECIAL_DAYS = new Set(SPECIAL_CLOSURES.map(toDayNumber));

const holidayCache = new Map<number, Set<number>>();

/** Full-day NYSE holidays in a calendar year, as day numbers. */
export function holidays(y: number): Set<number> {
  const cached = holidayCache.get(y);
  if (cached) return cached;
  const days: number[] = [];
  // New Year's Day: Sunday moves to Monday; a Saturday New Year is not made up.
  const ny = daysFromCivil(y, 1, 1);
  if (weekday(ny) !== 6) days.push(observed(ny));
  if (y >= 1998) days.push(nthWeekday(y, 1, 1, 3)); // Martin Luther King Jr. Day
  days.push(nthWeekday(y, 2, 1, 3)); // Washington's Birthday
  days.push(easter(y) - 2); // Good Friday
  days.push(lastWeekday(y, 5, 1)); // Memorial Day
  if (y >= 2022) days.push(observed(daysFromCivil(y, 6, 19))); // Juneteenth
  days.push(observed(daysFromCivil(y, 7, 4))); // Independence Day
  days.push(nthWeekday(y, 9, 1, 1)); // Labor Day
  days.push(nthWeekday(y, 11, 4, 4)); // Thanksgiving
  days.push(observed(daysFromCivil(y, 12, 25))); // Christmas
  const set = new Set(days);
  holidayCache.set(y, set);
  return set;
}

export function isTradingDayNumber(n: number): boolean {
  const wd = weekday(n);
  if (wd === 0 || wd === 6) return false;
  if (SPECIAL_DAYS.has(n)) return false;
  return !holidays(civilFromDays(n)[0]).has(n);
}

export function isTradingDay(iso: IsoDate): boolean {
  return isTradingDayNumber(toDayNumber(iso));
}

/** The first trading day strictly after `iso`. */
export function nextTradingDay(iso: IsoDate): IsoDate {
  let n = toDayNumber(iso) + 1;
  while (!isTradingDayNumber(n)) n++;
  return fromDayNumber(n);
}

/** Trading days from `start` to `end`, both inclusive. */
export function tradingDaysBetween(start: IsoDate, end: IsoDate): IsoDate[] {
  const out: IsoDate[] = [];
  const last = toDayNumber(end);
  for (let n = toDayNumber(start); n <= last; n++) if (isTradingDayNumber(n)) out.push(fromDayNumber(n));
  return out;
}

/** `count` trading days starting on or after `start`. */
export function tradingDaysFrom(start: IsoDate, count: number): IsoDate[] {
  const out: IsoDate[] = [];
  for (let n = toDayNumber(start); out.length < count; n++) if (isTradingDayNumber(n)) out.push(fromDayNumber(n));
  return out;
}
