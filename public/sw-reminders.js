// Imported by the generated service worker (see `workbox.importScripts` in vite.config.ts).
// Streak reminders: the app plans them (src/game/reminders.ts) and stores the plan in
// IndexedDB; when the browser wakes this worker, show the one that is due, once, and only while
// no Dip Lab window is on screen. Keep the tag, keys and `dueReminder` in step with that file.
/* global self, clients, indexedDB */

const REMINDER_TAG = 'dip-lab-reminder';
const DB_NAME = 'dip-lab';
const STORE = 'progress';
const PLAN = 'reminders';
const SHOWN = 'reminderShown';
const SHOWN_LIMIT = 10;

/** The app's database, or null if it doesn't exist yet (never create it from here). */
function openDb() {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME);
      req.onupgradeneeded = () => req.transaction.abort();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function request(db, mode, run) {
  return new Promise((resolve) => {
    try {
      const req = run(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

function dueReminder(items, shown, now) {
  let due = null;
  for (const r of items) if (r.at <= now && now < r.until && !shown.includes(r.id)) due = r;
  return due;
}

async function showDueReminder() {
  const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });
  if (windows.some((w) => w.visibilityState === 'visible')) return;
  const db = await openDb();
  if (!db) return;
  try {
    if (!db.objectStoreNames.contains(STORE)) return;
    const plan = await request(db, 'readonly', (s) => s.get(PLAN));
    const saved = await request(db, 'readonly', (s) => s.get(SHOWN));
    const shown = Array.isArray(saved) ? saved : [];
    const items = Array.isArray(plan?.items) ? plan.items : [];
    const due = dueReminder(items, shown, Date.now());
    if (!due) return;
    await self.registration.showNotification(due.title, {
      body: due.body,
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      tag: REMINDER_TAG,
    });
    const next = [...shown.filter((id) => id !== due.id), due.id].slice(-SHOWN_LIMIT);
    await request(db, 'readwrite', (s) => s.put(next, SHOWN));
  } finally {
    db.close();
  }
}

// Chrome wakes an installed app's worker now and then; check on either of our sync tags.
self.addEventListener('periodicsync', (event) => {
  if (event.tag !== REMINDER_TAG && event.tag !== 'dip-lab-update') return;
  event.waitUntil(showDueReminder().catch(() => {}));
});

self.addEventListener('notificationclick', (event) => {
  if (event.notification.tag !== REMINDER_TAG) return;
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows[0];
      return open ? open.focus() : clients.openWindow(self.registration.scope);
    }),
  );
});
