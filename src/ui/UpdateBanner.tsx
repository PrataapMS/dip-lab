import { useState } from 'preact/hooks';
import { useRegisterSW } from 'virtual:pwa-register/preact';
import {
  alertEnv,
  canOfferAlerts,
  enableUpdateAlerts,
  registerBackgroundCheck,
  UPDATE_CHECK_MS,
} from './updates';

function watchForUpdates(reg: ServiceWorkerRegistration) {
  const check = () => {
    if (navigator.onLine && !reg.installing) reg.update().catch(() => {});
  };
  setInterval(check, UPDATE_CHECK_MS);
  window.addEventListener('online', check);
  registerBackgroundCheck(reg);
}

/** "A new version is ready" with an Update button; the app keeps running until tapped. */
export function UpdateBanner({ hasRun }: { hasRun: boolean }) {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW: (_url, reg) => {
      if (reg) watchForUpdates(reg);
    },
  });
  if (!needRefresh) return null;
  return (
    <section class="panel update-banner" role="status" aria-live="polite">
      <span class="mono tiny accent">// UPDATE READY</span>
      <p class="small">
        A new version of Dip Lab is ready. Your XP and badges are kept
        {hasRun ? ', but updating now ends the current run (it is not saved yet).' : '.'}
      </p>
      <div class="row gap-8">
        <button type="button" class="primary" onClick={() => updateServiceWorker(true)}>
          Update now
        </button>
        <button type="button" class="ghost" onClick={() => setNeedRefresh(false)}>
          Later
        </button>
      </div>
    </section>
  );
}

/** One-line opt-in on Home for system alerts when an update lands while the app is closed. */
export function UpdateAlertsOptIn() {
  const [offer, setOffer] = useState(() => canOfferAlerts(alertEnv()));
  if (!offer) return null;
  return (
    <button
      type="button"
      class="link small"
      onClick={() => enableUpdateAlerts().finally(() => setOffer(false))}
    >
      Notify me when a new version is out
    </button>
  );
}
