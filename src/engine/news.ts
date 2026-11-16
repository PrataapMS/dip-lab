import type { DividendPayment } from './account';
import type { MarketEvent, Tone } from './events';
import { eventText } from './headlines';
import type { BuiltMarket } from './market';

/** A line in the player's news feed: plain data, safe to post from the worker. */
export interface NewsItem {
  day: number;
  bar: number;
  kind: MarketEvent['kind'] | 'dividend';
  ticker: string | null;
  tone: Tone;
  text: string;
  /** About something the player holds (or paid to them). */
  mine: boolean;
}

/** A stock nobody follows still makes the feed when it moves at least this much overnight. */
export const BIG_MOVE = 0.08;
/** At most this many such stocks per day, so a busy earnings day doesn't flood the feed. */
export const MAX_OTHER_PER_DAY = 4;

export function newsItem(e: MarketEvent, mine: boolean): NewsItem {
  return { day: e.day, bar: e.bar, kind: e.kind, ticker: e.ticker, tone: e.tone, text: eventText(e), mine };
}

/**
 * The part of a batch of events worth showing: every headline, anything about a ticker the
 * player follows (holds, watches, has an order on), and the biggest moves elsewhere.
 * Events must be in time order.
 */
export function selectNews(
  events: readonly MarketEvent[],
  follows: (ticker: string) => boolean,
  holds: (ticker: string) => boolean,
): NewsItem[] {
  const out: NewsItem[] = [];
  let day = -1;
  let others = 0;
  for (const e of events) {
    if (e.day !== day) {
      day = e.day;
      others = 0;
    }
    const t = e.ticker;
    if (e.kind === 'headline' || (t && follows(t))) {
      out.push(newsItem(e, !!t && holds(t)));
    } else if (Math.abs(e.move) >= BIG_MOVE && others < MAX_OTHER_PER_DAY) {
      others++;
      out.push(newsItem(e, false));
    }
  }
  return out;
}

export function dividendItem(p: DividendPayment): NewsItem {
  return {
    day: p.at.day,
    bar: p.at.bar,
    kind: 'dividend',
    ticker: p.ticker,
    tone: 'up',
    text: `Dividend from ${p.ticker}: +$${p.amount.toFixed(2)} for your ${Number(p.shares.toFixed(6))} shares`,
    mine: true,
  };
}

/** News about one ticker up to a point in time, newest first. */
export function tickerNews(m: BuiltMarket, ticker: string, day: number, bar: number, limit = 8): NewsItem[] {
  const out: NewsItem[] = [];
  const end = m.eventIndex[day + 1] ?? m.events.length;
  for (let k = end - 1; k >= 0 && out.length < limit; k--) {
    const e = m.events[k];
    if (!e || e.ticker !== ticker || (e.day === day && e.bar > bar)) continue;
    out.push(newsItem(e, false));
  }
  return out;
}

export interface Upcoming {
  /** Day of the next earnings report (gap at that open), or null. */
  earnings: number | null;
  /** Next ex-dividend day, or null. */
  exDividend: number | null;
}

/** What's coming up for a ticker after today. Dates are public; results are not. */
export function upcomingFor(m: BuiltMarket, ticker: string, today: number): Upcoming {
  let earnings: number | null = null;
  for (let k = m.eventIndex[today + 1] ?? m.events.length; k < m.events.length; k++) {
    const e = m.events[k];
    if (e?.kind === 'earnings' && e.ticker === ticker) {
      earnings = e.day;
      break;
    }
  }
  const div = m.dividends.find((d) => d.ticker === ticker && d.day > today);
  return { earnings, exDividend: div?.day ?? null };
}
