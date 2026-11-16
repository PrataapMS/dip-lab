import { useEffect, useState } from 'preact/hooks';

/**
 * Installing the app. Chrome, Edge and Android fire `beforeinstallprompt`, which we keep so a
 * button can show the browser's install dialog later. iOS Safari has no such event: there the
 * player adds it from the Share menu, so we show those steps instead.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
let installedNow = false;
const listeners = new Set<() => void>();
const changed = () => {
  for (const fn of listeners) fn();
};

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Keep it for our own button instead of the browser's mini bar.
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    changed();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    installedNow = true;
    changed();
  });
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** iPhone or iPad (iPadOS reports itself as a Mac with touch). */
export function isIos(ua: string, platform: string, touchPoints: number): boolean {
  return /iPad|iPhone|iPod/.test(ua) || (platform === 'MacIntel' && touchPoints > 1);
}

export interface InstallState {
  installed: boolean;
  /** The browser's install dialog can be shown. */
  canPrompt: boolean;
  /** Show the Share → Add to Home Screen steps. */
  ios: boolean;
}

/** The Home card: once a run is finished, while not installed or dismissed, when installable. */
export function showInstallCard(
  s: InstallState,
  finishedRuns: number,
  dismissed: boolean,
): boolean {
  return finishedRuns > 0 && !dismissed && !s.installed && (s.canPrompt || s.ios);
}

export function useInstall(): InstallState & { prompt: () => Promise<boolean> } {
  const read = (): InstallState => ({
    installed: installedNow || isStandalone(),
    canPrompt: !!deferred,
    ios:
      typeof navigator !== 'undefined' &&
      isIos(navigator.userAgent, navigator.platform, navigator.maxTouchPoints ?? 0),
  });
  const [state, setState] = useState(read);
  useEffect(() => {
    const fn = () => setState(read());
    listeners.add(fn);
    fn();
    return () => {
      listeners.delete(fn);
    };
  }, []);
  const prompt = async () => {
    const e = deferred;
    if (!e) return false;
    deferred = null;
    await e.prompt();
    const { outcome } = await e.userChoice;
    changed();
    return outcome === 'accepted';
  };
  return { ...state, prompt };
}
