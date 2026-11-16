// Imported by the generated service worker (see `workbox.importScripts` in vite.config.ts).
// When a new version installs while no Dip Lab window is on screen, show a system
// notification (only if the player allowed them). With a window open, the in-app banner says it.
/* global self, clients */

const UPDATE_TAG = 'dip-lab-update';

async function notifyIfHidden() {
  const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });
  if (windows.some((w) => w.visibilityState === 'visible')) return;
  await self.registration.showNotification('Dip Lab update ready', {
    body: 'A new version is ready. Open Dip Lab to switch to it.',
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    tag: UPDATE_TAG,
  });
}

self.addEventListener('install', (event) => {
  // No active worker means this is the first install, not an update.
  if (!self.registration.active) return;
  event.waitUntil(notifyIfHidden().catch(() => {}));
});

// Chrome on an installed app wakes the worker now and then, even with the app closed.
self.addEventListener('periodicsync', (event) => {
  if (event.tag !== UPDATE_TAG) return;
  event.waitUntil(self.registration.update().catch(() => {}));
});

self.addEventListener('notificationclick', (event) => {
  if (event.notification.tag !== UPDATE_TAG) return;
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows[0];
      return open ? open.focus() : clients.openWindow(self.registration.scope);
    }),
  );
});
