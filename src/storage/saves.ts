import type { RunSave, SavedSnapshot } from '../engine/save';
import { load, loadRange, type WriteOp, write } from './db';
import { SLOTS, type SlotBody, type SlotHeader } from './slots';

/**
 * Run saves in IndexedDB. Store `saves`: `['header', slot]` (small, for lists) and
 * `['body', slot]` (header + run without closes). Store `snapshots`: `[slot, chunk]`, each
 * `CHUNK` closes. Written only by the engine worker, so writes never race.
 */

const headerKey = (slot: number) => ['header', slot];
const bodyKey = (slot: number) => ['body', slot];
const chunkRange = (slot: number, from = 0) => IDBKeyRange.bound([slot, from], [slot, Infinity]);

export async function readHeaders(): Promise<(SlotHeader | null)[]> {
  const out: (SlotHeader | null)[] = [];
  for (let s = 0; s < SLOTS; s++)
    out.push(((await load('saves', headerKey(s))) as SlotHeader) ?? null);
  return out;
}

/** A whole slot, closes included, or null when it is empty. */
export async function readSlot(slot: number): Promise<SlotBody | null> {
  const body = (await load('saves', bodyKey(slot))) as SlotBody | undefined;
  if (!body) return null;
  const chunks = (await loadRange('snapshots', chunkRange(slot))) as SavedSnapshot[][];
  const snapshots = chunks.flat();
  return { header: body.header, save: { ...body.save, snapshots } };
}

/** Closes `index * CHUNK` onwards, as stored. */
export interface Chunk {
  index: number;
  snapshots: SavedSnapshot[];
}

/**
 * Save a slot in one transaction: the run without its closes, plus the chunks of closes that
 * changed. `clear` drops every stored chunk first (a new run, a replay or an import).
 */
export async function writeSlot(
  header: SlotHeader,
  save: RunSave,
  chunks: Chunk[],
  clear: boolean,
): Promise<boolean> {
  const slot = header.slot;
  const ops: WriteOp[] = [];
  if (clear) ops.push({ store: 'snapshots', delete: chunkRange(slot) });
  ops.push({ store: 'saves', key: headerKey(slot), value: header });
  ops.push({
    store: 'saves',
    key: bodyKey(slot),
    value: { header, save: { ...save, snapshots: [] } },
  });
  for (const c of chunks)
    ops.push({ store: 'snapshots', key: [slot, c.index], value: c.snapshots });
  return write(ops);
}

export async function deleteSlot(slot: number): Promise<boolean> {
  return write([
    { store: 'saves', delete: headerKey(slot) },
    { store: 'saves', delete: bodyKey(slot) },
    { store: 'snapshots', delete: chunkRange(slot) },
  ]);
}
