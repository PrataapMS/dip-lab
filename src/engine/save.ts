import type { AccountSettings, AccountState, Position } from './account';
import { BARS_PER_DAY } from './intraday';
import type { BuiltMarket } from './market';
import { type BranchOf, type CloseSnapshot, type EndReason, Run, type RunAlert } from './run';
import type { CustomOptions } from './scenarios';

/**
 * A run as plain data, so it can be stored and restored exactly. The market is not saved: it
 * is rebuilt from scenario + seed (+ custom options), which gives the same prices every time.
 * Restoring is instant; nothing is re-simulated.
 */

/** Bump when `RunSave` changes shape; older saves are then rejected with a plain message. */
export const SAVE_FORMAT = 1;

/** What the market is built from. */
export interface RunSource {
  scenarioId: string;
  seed: number;
  custom?: CustomOptions;
}

/**
 * One close. Positions only change on days with a fill, so a close whose positions equal the
 * previous close's stores that close's index instead of a copy.
 */
export interface SavedSnapshot extends Omit<CloseSnapshot, 'state'> {
  state: Omit<CloseSnapshot['state'], 'positions' | 'settings'>;
  positions: Record<string, Position> | number;
}

export interface RunSave {
  format: number;
  source: RunSource;
  settings: AccountSettings;
  targetReturn?: number;
  pauseAtClose: boolean;
  /** Where the clock stands. A restored run is always paused. */
  clock: { day: number; bar: number; dayLengthMs: number };
  account: AccountState;
  alerts: RunAlert[];
  endReason: EndReason | null;
  branchOf: BranchOf | null;
  snapshots: SavedSnapshot[];
}

/** A save that can't be used, with a message fit to show the player. */
export class SaveError extends Error {
  override name = 'SaveError';
}

function samePositions(a: Record<string, Position>, b: Record<string, Position>): boolean {
  if (a === b) return true;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  for (const k of keys) {
    const p = a[k];
    const q = b[k];
    if (!p || !q || p.shares !== q.shares || p.costBasis !== q.costBasis) return false;
  }
  return true;
}

/** Closes the account has recorded at a clock position. */
function closesAt(day: number, bar: number): number {
  return bar >= BARS_PER_DAY ? day + 1 : day;
}

/**
 * Closes `from` to `to` (exclusive) as stored: a close whose positions equal the close
 * before it stores that close's index, so encoding a range needs nothing outside it.
 */
export function encodeSnapshots(
  snapshots: readonly CloseSnapshot[],
  from = 0,
  to = snapshots.length,
): SavedSnapshot[] {
  const out: SavedSnapshot[] = [];
  for (let i = from; i < to; i++) {
    const s = snapshots[i] as CloseSnapshot;
    const { positions, settings: _settings, ...state } = s.state;
    const prev = snapshots[i - 1]?.state.positions;
    out.push({
      ...s,
      state,
      positions: prev && samePositions(prev, positions) ? i - 1 : positions,
    });
  }
  return out;
}

/** The run as plain data. `withSnapshots: false` leaves the closes out (saved separately). */
export function saveRun(run: Run, source: RunSource, withSnapshots = true): RunSave {
  const { day, bar, dayLengthMs } = run.clock;
  return {
    format: SAVE_FORMAT,
    source: { ...source },
    settings: run.account.settings,
    ...(run.targetReturn !== undefined ? { targetReturn: run.targetReturn } : {}),
    pauseAtClose: run.pauseAtClose,
    clock: { day, bar, dayLengthMs },
    account: run.account,
    alerts: [...run.alerts],
    endReason: run.endReason,
    branchOf: run.branchOf,
    snapshots: withSnapshots ? encodeSnapshots(run.snapshots) : [],
  };
}

/** Checks that a save fits the market it is restored on. Throws `SaveError`. */
export function checkSave(save: RunSave, market: BuiltMarket): void {
  if (save.format !== SAVE_FORMAT)
    throw new SaveError(
      save.format > SAVE_FORMAT
        ? 'This save comes from a newer version of Dip Lab. Update the app to open it.'
        : 'This save comes from an older version of Dip Lab and can no longer be opened.',
    );
  if (market.scenario.id !== save.source.scenarioId || market.seed !== save.source.seed)
    throw new SaveError('This save belongs to a different market.');
  const { day, bar } = save.clock;
  const days = market.dates.length;
  if (
    !Number.isInteger(day) ||
    !Number.isInteger(bar) ||
    day < 0 ||
    day >= days ||
    bar < 0 ||
    bar > BARS_PER_DAY
  )
    throw new SaveError('This save is damaged: its clock is outside the market.');
  const closes = closesAt(day, bar);
  if (save.account.equityByDay.length !== closes || save.snapshots.length !== closes)
    throw new SaveError("This save is damaged: its closes don't match its clock.");
  const tickers = new Set(market.instruments.map((i) => i.ticker));
  for (const t of Object.keys(save.account.positions))
    if (!tickers.has(t)) throw new SaveError(`This save holds ${t}, which isn't in its market.`);
  save.snapshots.forEach((s, i) => {
    if (typeof s.positions === 'number' && !(s.positions >= 0 && s.positions < i))
      throw new SaveError('This save is damaged: a close points at a later one.');
  });
}

/**
 * Tickers whose first listing year was corrected after saves existed (1.0), so an older save of
 * an early scenario can hold one its rebuilt market no longer lists.
 */
export const CORRECTED_LISTINGS: ReadonlySet<string> = new Set(['CZR', 'MARA', 'PWR', 'TDY']);

/**
 * The save with every position in a corrected ticker its market doesn't list closed at cost
 * (cash back, no gain or loss) and its open orders cancelled, in the account and at every close.
 * `dropped` names the ones the run held or had orders in at the save; the save is returned
 * unchanged when nothing needed fixing.
 */
export function dropUnlisted(
  save: RunSave,
  market: BuiltMarket,
): { save: RunSave; dropped: string[] } {
  const listed = new Set(market.instruments.map((i) => i.ticker));
  const gone = (t: string) => CORRECTED_LISTINGS.has(t) && !listed.has(t);
  const prune = (positions: Record<string, Position>) => {
    let refund = 0;
    const kept: Record<string, Position> = {};
    const out: string[] = [];
    for (const [t, p] of Object.entries(positions)) {
      if (gone(t)) {
        out.push(t);
        refund += p.costBasis;
      } else kept[t] = p;
    }
    return { kept, refund, out };
  };
  const openIn = (orders: { ticker: string; status: string }[]) =>
    orders.filter((o) => o.status === 'open' && gone(o.ticker)).map((o) => o.ticker);
  const cancel = <T extends { ticker: string; status: string }>(orders: T[]): T[] =>
    orders.map((o) => (o.status === 'open' && gone(o.ticker) ? { ...o, status: 'cancelled' } : o));
  let changed = false;
  // Closes that point at an earlier one share its positions, so they need the same refund.
  const resolved: Record<string, Position>[] = [];
  const snapshots = save.snapshots.map((s, i) => {
    const positions = typeof s.positions === 'number' ? resolved[s.positions] : s.positions;
    if (!positions) return s;
    resolved[i] = positions;
    const { kept, refund, out } = prune(positions);
    if (!out.length && !openIn(s.openOrders).length) return s;
    changed = true;
    return {
      ...s,
      state: { ...s.state, cash: s.state.cash + refund },
      positions: typeof s.positions === 'number' ? s.positions : kept,
      openOrders: cancel(s.openOrders),
    };
  });
  const account = save.account;
  const now = prune(account.positions);
  // Only what the run holds now is news to the player; older closes are fixed quietly.
  const dropped = [...new Set([...now.out, ...openIn(account.orders)])].sort();
  if (!changed && !dropped.length) return { save, dropped };
  return {
    save: {
      ...save,
      account: {
        ...account,
        cash: account.cash + now.refund,
        positions: now.kept,
        orders: cancel(account.orders),
      },
      snapshots,
    },
    dropped,
  };
}

/** The run a save describes, on its rebuilt market, paused. Throws `SaveError`. */
export function restoreRun(market: BuiltMarket, save: RunSave): Run {
  checkSave(save, market);
  const run = new Run(market, save.settings, save.clock.dayLengthMs, {
    pauseAtClose: save.pauseAtClose,
    targetReturn: save.targetReturn,
  });
  run.account = { ...save.account, settings: save.settings };
  run.clock = { ...run.clock, day: save.clock.day, bar: save.clock.bar, playing: false, carry: 0 };
  run.alerts.push(...save.alerts);
  run.endReason = save.endReason;
  run.branchOf = save.branchOf;
  save.snapshots.forEach((s, i) => {
    const positions =
      typeof s.positions === 'number' ? run.snapshots[s.positions]?.state.positions : s.positions;
    if (!positions) throw new SaveError(`This save is damaged at close ${i + 1}.`);
    const { positions: _p, ...rest } = s;
    run.snapshots[i] = { ...rest, state: { ...s.state, positions, settings: save.settings } };
  });
  return run;
}
