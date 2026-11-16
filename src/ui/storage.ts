/**
 * Tiny IndexedDB wrapper: one database, one store per kind of record. Progress lives here now;
 * run saves join in phase 5. Falls back to memory when IndexedDB is missing or blocked
 * (private windows, tests), so the game still works, it just forgets on reload.
 */
const DB_NAME = 'dip-lab';
const DB_VERSION = 1;
const STORES = ['progress'] as const;
type Store = (typeof STORES)[number];

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
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

export async function load(store: Store, key: string): Promise<unknown> {
  const db = await openDb();
  if (!db) return memory.get(`${store}/${key}`);
  return new Promise((resolve) => {
    try {
      const req = db.transaction(store, 'readonly').objectStore(store).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(memory.get(`${store}/${key}`));
    } catch {
      resolve(memory.get(`${store}/${key}`));
    }
  });
}

export async function save(store: Store, key: string, value: unknown): Promise<void> {
  memory.set(`${store}/${key}`, value);
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}
