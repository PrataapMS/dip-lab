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
 * One close. Positions only change on days with a fill, so a close whose positions equal an
 * earlier close's stores that close's index instead of a copy.
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

export function saveRun(run: Run, source: RunSource): RunSave {
  let lastIndex = -1;
  let last: Record<string, Position> | null = null;
  const snapshots = run.snapshots.map((s, i): SavedSnapshot => {
    const { positions, settings: _settings, ...state } = s.state;
    let stored: SavedSnapshot['positions'] = positions;
    if (last && samePositions(last, positions)) stored = lastIndex;
    else {
      last = positions;
      lastIndex = i;
    }
    return { ...s, state, positions: stored };
  });
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
    snapshots,
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
