import { useEffect, useState } from 'preact/hooks';

export type OfflineStatus = 'checking' | 'ready' | 'notYet' | 'dev' | 'unsupported';

/** Whether the service worker controls the page and the app's files are cached for offline use. */
export function useOfflineStatus(): OfflineStatus {
  const [status, setStatus] = useState<OfflineStatus>('checking');
  useEffect(() => {
    if (import.meta.env.DEV) return setStatus('dev');
    const sw = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined;
    if (!sw || typeof caches === 'undefined') return setStatus('unsupported');
    let live = true;
    const check = async () => {
      let ready = false;
      if (sw.controller) {
        for (const key of await caches.keys())
          if (key.includes('precache') && (await (await caches.open(key)).keys()).length > 0)
            ready = true;
      }
      if (live) setStatus(ready ? 'ready' : 'notYet');
    };
    void check().catch(() => live && setStatus('notYet'));
    sw.addEventListener('controllerchange', check);
    return () => {
      live = false;
      sw.removeEventListener('controllerchange', check);
    };
  }, []);
  return status;
}

export const OFFLINE_TEXT: Record<OfflineStatus, string> = {
  checking: 'Checking offline support…',
  ready: 'Ready offline: everything is stored on this device.',
  notYet: 'Not ready offline yet. Keep it open once with a connection.',
  dev: 'Offline mode is off in development builds.',
  unsupported: "This browser can't run Dip Lab offline.",
};
