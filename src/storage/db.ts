/**
 * Tiny IndexedDB wrapper, used by the UI (progress, settings) and the engine worker (run
 * saves). One database, one store per kind of record. Progress falls back to memory when
 * IndexedDB is missing or blocked (private windows, tests), so the game still works, it just
 * forgets on reload; run saves are simply skipped then.
 */
const DB_NAME = 'dip-lab';
const DB_VERSION = 2;
/** `saves`: slot headers and run bodies. `snapshots`: closes of each slot, in chunks. */
const STORES = ['progress', 'saves', 'snapshots'] as const;
export type Store = (typeof STORES)[number];

const memory = new Map<string, unknown>();
let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        for (const s of STORES)
          if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s);
      };
      req.onsuccess = () => {
        const db = req.result;
        // A newer version in another tab wants to upgrade: let it, and reopen on next use.
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        resolve(db);
      };
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

export async function load(store: Store, key: IDBValidKey): Promise<unknown> {
  const memKey = `${store}/${String(key)}`;
  const db = await openDb();
  if (!db) return memory.get(memKey);
  return new Promise((resolve) => {
    try {
      const req = db.transaction(store, 'readonly').objectStore(store).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(memory.get(memKey));
    } catch {
      resolve(memory.get(memKey));
    }
  });
}

export async function save(store: Store, key: IDBValidKey, value: unknown): Promise<void> {
  memory.set(`${store}/${String(key)}`, value);
  await write([{ store, key, value }]);
}

/** One step of a `write`: put a value, or delete a key or a key range. */
export type WriteOp =
  | { store: Store; key: IDBValidKey; value: unknown }
  | { store: Store; delete: IDBValidKey | IDBKeyRange };

/** Several puts and deletes in one transaction: all of them happen, or none. */
export async function write(ops: WriteOp[]): Promise<boolean> {
  const db = await openDb();
  if (!db || !ops.length) return false;
  const stores = [...new Set(ops.map((o) => o.store))];
  return new Promise<boolean>((resolve) => {
    try {
      const tx = db.transaction(stores, 'readwrite');
      for (const op of ops) {
        const s = tx.objectStore(op.store);
        if ('value' in op) s.put(op.value, op.key);
        else s.delete(op.delete);
      }
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

/** Every value whose key is in a range, in key order. */
export async function loadRange(store: Store, range: IDBKeyRange): Promise<unknown[]> {
  const db = await openDb();
  if (!db) return [];
  return new Promise((resolve) => {
    try {
      const req = db.transaction(store, 'readonly').objectStore(store).getAll(range);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

/** True when saves really go to the device (not just memory). */
export async function persistent(): Promise<boolean> {
  return (await openDb()) !== null;
}
