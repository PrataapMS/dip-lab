import type { Side } from '../engine/account';
import { fillPrice } from '../engine/costs';
import type { OrderType } from '../engine/orders';

export interface PreviewInput {
  side: Side;
  type: OrderType;
  unit: 'dollars' | 'shares';
  amount: number;
  /** Current mid price. */
  price: number;
  half: number;
  limitPrice?: number;
  stopPrice?: number;
  cash: number;
  heldShares: number;
  commission: number;
}

export interface Preview {
  estShares: number;
  /** Expected price per share, spread included. */
  fillPrice: number;
  cashAfter: number;
  /** True when the order would fill right now (market, or a limit/stop already crossed). */
  fillsNow: boolean;
  /** Plain-English problem that would get the order rejected, if any. */
  problem: string | null;
}

/** Best guess at what an order will do, for the sheet's terminal preview. The engine decides. */
export function previewOrder(p: PreviewInput): Preview {
  const ask = fillPrice(p.price, 'buy', p.half);
  const bid = fillPrice(p.price, 'sell', p.half);
  let fill: number;
  let fillsNow: boolean;
  switch (p.type) {
    case 'market':
      fill = p.side === 'buy' ? ask : bid;
      fillsNow = true;
      break;
    case 'limit': {
      const limit = p.limitPrice ?? 0;
      fillsNow = p.side === 'buy' ? ask <= limit : bid >= limit;
      fill = fillsNow ? (p.side === 'buy' ? ask : bid) : limit;
      break;
    }
    case 'stop': {
      const stop = p.stopPrice ?? 0;
      fillsNow = p.side === 'sell' ? p.price <= stop : p.price >= stop;
      fill = fillsNow ? (p.side === 'buy' ? ask : bid) : fillPrice(stop, p.side, p.half);
      break;
    }
  }
  const amount = Number.isFinite(p.amount) ? p.amount : 0;
  const estShares = fill > 0 ? (p.unit === 'dollars' ? amount / fill : amount) : 0;
  const gross = estShares * fill;
  const cashAfter = p.side === 'buy' ? p.cash - gross - p.commission : p.cash + gross - p.commission;

  let problem: string | null = null;
  if (!(amount > 0)) problem = 'Enter an amount above zero.';
  else if (p.type === 'limit' && !(p.limitPrice && p.limitPrice > 0)) problem = 'Set a limit price above zero.';
  else if (p.type === 'stop' && !(p.stopPrice && p.stopPrice > 0)) problem = 'Set a stop price above zero.';
  else if (p.side === 'buy' && cashAfter < -1e-9) problem = 'Not enough cash for this order.';
  else if (p.side === 'sell' && p.heldShares <= 0) problem = "You don't own any of this stock.";
  else if (p.side === 'sell' && estShares > p.heldShares + 1e-6) problem = `You only own ${Number(p.heldShares.toFixed(4))} shares.`;
  return { estShares, fillPrice: fill, cashAfter, fillsNow, problem };
}

export interface RiskInput {
  side: Side;
  ticker: string;
  kind: 'stock' | 'etf';
  vol: number;
  /** Value of the order in dollars. */
  orderValue: number;
  /** Value already held in this ticker. */
  heldValue: number;
  accountValue: number;
  /** A sell of everything held. */
  closesPosition?: boolean;
}

export interface Risk {
  /** 1 (low) to 5 (very high). */
  level: number;
  label: string;
  text: string;
}

const LABELS = ['low', 'low', 'medium', 'high', 'very high'];

/**
 * A 5-step risk check: how much of the account ends up in this one name, weighted by how
 * much the name swings. Teaches position sizing rather than forbidding anything.
 */
export function riskCheck(r: RiskInput): Risk {
  const after = r.side === 'buy' ? r.heldValue + r.orderValue : Math.max(0, r.heldValue - r.orderValue);
  const share = r.accountValue > 0 ? after / r.accountValue : 0;
  const pct = `${(share * 100).toFixed(1)}%`;
  if (r.side === 'sell') {
    return {
      level: 1,
      label: 'low',
      text: !r.closesPosition && after > 0 ? `Selling lowers your bet on ${r.ticker} to ${pct} of your account.` : `This closes your ${r.ticker} position.`,
    };
  }
  // A fund holds many companies, so one bad company can't sink it: weigh it at about a third.
  const swing = (r.vol / 0.25) * (r.kind === 'etf' ? 0.35 : 1);
  const score = share * swing;
  const level = score < 0.05 ? 1 : score < 0.12 ? 2 : score < 0.25 ? 3 : score < 0.5 ? 4 : 5;
  const how =
    r.kind === 'etf'
      ? `${r.ticker} is a fund of many companies, so it swings less than one stock`
      : r.vol >= 0.4
        ? `${r.ticker} swings a lot`
        : r.vol >= 0.25
          ? `${r.ticker} swings a fair bit`
          : `${r.ticker} is fairly steady`;
  return { level, label: LABELS[level - 1] ?? 'low', text: `${how}, and this puts ${pct} of your account in it.` };
}

/** Round to cents for price inputs. */
export function cents(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Parse "$1,000.50" or "3.5" typed by the player. NaN when it isn't a number. */
export function parseAmount(text: string): number {
  const cleaned = text.replace(/[$,\s]/g, '');
  return cleaned === '' ? NaN : Number(cleaned);
}
