import {
  type AccountState,
  executeTrade,
  exposure,
  FORCED_SALE_TARGET,
  type Fill,
  MAINTENANCE_MARGIN,
  type MarketTime,
  type PriceOf,
} from './account';
import { fillPrice } from './costs';

/**
 * Margin calls and forced sales. At each close the account's equity is compared with what it
 * holds. Below `MAINTENANCE_MARGIN` the broker calls; still below at the next close, it sells
 * at the following open (gaps and all) until equity is back to `FORCED_SALE_TARGET`.
 */

export type MarginEvent =
  | { kind: 'call'; ratio: number }
  | { kind: 'met' }
  | { kind: 'due'; ratio: number };

/** Equity as a share of everything held (1 or more with no borrowing; Infinity with nothing held). */
export function marginRatio(state: AccountState, priceOf?: PriceOf): number {
  const { equity, gross } = exposure(state.cash, state.positions, priceOf);
  return gross > 0 ? equity / gross : Infinity;
}

/** Check the account at the close of `day`. */
export function checkMargin(
  state: AccountState,
  priceOf: PriceOf,
  day: number,
): { state: AccountState; event: MarginEvent | null } {
  if (!state.settings.margin) return { state, event: null };
  const ratio = marginRatio(state, priceOf);
  if (ratio >= MAINTENANCE_MARGIN) {
    if (!state.marginCall) return { state, event: null };
    return { state: { ...state, marginCall: null, forcedSaleDue: false }, event: { kind: 'met' } };
  }
  if (!state.marginCall) {
    const call = { day, ratio };
    return {
      state: { ...state, marginCall: call, marginCalls: [...state.marginCalls, call] },
      event: { kind: 'call', ratio },
    };
  }
  if (day > state.marginCall.day && !state.forcedSaleDue)
    return { state: { ...state, forcedSaleDue: true }, event: { kind: 'due', ratio } };
  return { state, event: null };
}

export interface ForceQuote {
  mid: number;
  half: number;
}

/**
 * The broker sells: largest holdings first, at the open less the spread, until equity is
 * `FORCED_SALE_TARGET` of what is left (or nothing is left). Clears the call.
 */
export function forceSale(
  state: AccountState,
  quote: (ticker: string) => ForceQuote | undefined,
  at: MarketTime,
): { state: AccountState; fills: Fill[] } {
  let s = state;
  const fills: Fill[] = [];
  const priceOf: PriceOf = (t) => quote(t)?.mid;
  const order = Object.entries(s.positions)
    .map(([ticker, pos]) => ({ ticker, value: Math.abs(pos.shares * (priceOf(ticker) ?? 0)) }))
    .sort((a, b) => b.value - a.value || a.ticker.localeCompare(b.ticker));
  for (const { ticker } of order) {
    if (marginRatio(s, priceOf) >= FORCED_SALE_TARGET) break;
    const q = quote(ticker);
    const pos = s.positions[ticker];
    if (!q || !pos || pos.shares === 0 || !(q.mid > 0)) continue;
    const side = pos.shares > 0 ? 'sell' : 'buy';
    const held = Math.abs(pos.shares);
    // Selling x shares at price p (mid m) cuts holdings by x·m and equity by x·|m − p| + commission.
    const { equity, gross } = exposure(s.cash, s.positions, priceOf);
    const p = fillPrice(q.mid, side, q.half);
    const per = FORCED_SALE_TARGET * q.mid - Math.abs(q.mid - p);
    const need = FORCED_SALE_TARGET * gross - equity + s.settings.commission;
    const shares = per > 0 ? Math.min(held, Math.ceil((need / per) * 1e6) / 1e6) : held;
    const r = executeTrade(s, {
      ticker,
      side,
      amount: { kind: 'shares', value: shares },
      mid: q.mid,
      halfSpread: q.half,
      at,
      forced: true,
    });
    if (!r.ok) continue;
    s = r.state;
    fills.push(r.fill);
  }
  return { state: { ...s, marginCall: null, forcedSaleDue: false }, fills };
}
