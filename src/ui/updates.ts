/** Shared with public/sw-update.js: notification tag and periodic sync tag. */
export const UPDATE_TAG = 'dip-lab-update';

/** How often an open app asks the host for a new version. */
export const UPDATE_CHECK_MS = 60 * 60 * 1000;

/** Chrome may wake an installed app's service worker about this often to check. */
export const BACKGROUND_CHECK_MS = 24 * 60 * 60 * 1000;

export interface AlertEnv {
  notifications: boolean;
  permission: NotificationPermission | null;
  installed: boolean;
}

/**
 * Offer update alerts only on an installed app (the only place a closed app can be told)
 * and only while the player hasn't answered the browser's prompt yet.
 */
export function canOfferAlerts(env: AlertEnv): boolean {
  return env.notifications && env.installed && env.permission === 'default';
}

export function alertEnv(): AlertEnv {
  const notifications = typeof Notification !== 'undefined' && 'serviceWorker' in navigator;
  return {
    notifications,
    permission: notifications ? Notification.permission : null,
    installed:
      window.matchMedia?.('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true,
  };
}

interface PeriodicSync {
  register(tag: string, options: { minInterval: number }): Promise<void>;
}

/** Ask Chrome to wake the service worker daily; silently does nothing elsewhere. */
export async function registerBackgroundCheck(reg: ServiceWorkerRegistration): Promise<void> {
  const sync = (reg as ServiceWorkerRegistration & { periodicSync?: PeriodicSync }).periodicSync;
  if (!sync || Notification.permission !== 'granted') return;
  try {
    const status = await navigator.permissions.query({
      name: 'periodic-background-sync' as PermissionName,
    });
    if (status.state === 'granted') {
      await sync.register(UPDATE_TAG, { minInterval: BACKGROUND_CHECK_MS });
    }
  } catch {
    // Not supported or not allowed: the hourly in-app check still runs.
  }
}

/** Ask for notification permission, then set up the background check. */
export async function enableUpdateAlerts(): Promise<NotificationPermission> {
  const permission = await Notification.requestPermission();
  if (permission === 'granted') {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg) await registerBackgroundCheck(reg);
  }
  return permission;
}
