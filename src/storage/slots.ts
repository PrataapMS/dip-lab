import type { AccountSettings } from '../engine/account';
import type { RunSave } from '../engine/save';
import type { CustomOptions } from '../engine/scenarios';

/**
 * Save slots: what each holds and when to write. Pure; the IndexedDB side is in `saves.ts`.
 * Each slot holds one run, in progress or finished, saved as it is played.
 */
export const SLOTS = 3;
/** Closes per stored chunk: a save at a close rewrites only the newest chunk. */
export const CHUNK = 64;

/** How a run was started, enough to start it again. */
export interface SlotConfig {
  scenarioId: string;
  seed: number;
  settings?: AccountSettings;
  targetReturn?: number;
  custom?: CustomOptions;
  /** Set when the run is a challenge from the Learn tab. */
  challenge?: string;
}

/** The small part of a save, shown in slot lists. */
export interface SlotHeader {
  slot: number;
  config: SlotConfig;
  scenarioName: string;
  /** Day on the clock (0-based) and the run's length. */
  day: number;
  totalDays: number;
  value: number;
  startingCash: number;
  /** SPY's return (dividends reinvested) over the same days. */
  spyReturn: number;
  finished: boolean;
  /** Grade letter once finished. */
  letter: string | null;
  /** Set when the run replays a moment of an earlier try. */
  branchDay: number | null;
  /** ISO time of the last save. */
  savedAt: string;
  app: string;
}

/** A slot as stored: the header plus the run without its closes (those are in chunks). */
export interface SlotBody {
  header: SlotHeader;
  save: RunSave;
}

/** The slot a new run goes into: the first empty one, or null when all are taken. */
export function freeSlot(headers: readonly (SlotHeader | null)[]): number | null {
  for (let i = 0; i < SLOTS; i++) if (!headers[i]) return i;
  return null;
}

/** The slot to suggest replacing when all are full: finished runs first, then the oldest save. */
export function slotToReplace(headers: readonly (SlotHeader | null)[]): number {
  const taken = headers.filter((h): h is SlotHeader => !!h);
  taken.sort(
    (a, b) => Number(b.finished) - Number(a.finished) || a.savedAt.localeCompare(b.savedAt),
  );
  return taken[0]?.slot ?? 0;
}

/** The unfinished run saved most recently, to resume at startup. */
export function latestUnfinished(headers: readonly (SlotHeader | null)[]): SlotHeader | null {
  let best: SlotHeader | null = null;
  for (const h of headers) if (h && !h.finished && (!best || h.savedAt > best.savedAt)) best = h;
  return best;
}

/**
 * Chunk numbers to (re)write when `saved` closes are already stored and the run now has
 * `total`: the chunk holding the first unsaved close up to the newest one.
 */
export function chunksToWrite(saved: number, total: number): number[] {
  if (total <= saved) return [];
  const out: number[] = [];
  for (let c = Math.floor(saved / CHUNK); c <= Math.floor((total - 1) / CHUNK); c++) out.push(c);
  return out;
}

/**
 * Coalesces save requests: one write at a time; requests made while writing collapse into one
 * more write after it. `write` should not throw (it is caught and the saver carries on).
 */
export function createSaver(write: () => Promise<void>): {
  request: () => void;
  idle: () => Promise<void>;
} {
  let running: Promise<void> | null = null;
  let again = false;
  const run = (): Promise<void> => {
    running = write()
      .catch(() => {})
      .then(() => {
        if (again) {
          again = false;
          return run();
        }
        running = null;
      });
    return running;
  };
  return {
    request() {
      if (running) again = true;
      else void run();
    },
    async idle() {
      while (running) await running;
    },
  };
}
