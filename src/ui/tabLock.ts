import { useEffect, useState } from 'preact/hooks';

/**
 * One tab at a time: two tabs playing the same save (or both updating progress) would
 * overwrite each other. A Web Lock is held for as long as the tab is open; a second tab finds
 * it taken and offers to take over, which sends the first tab to the same "open elsewhere" screen.
 */
const LOCK = 'dip-lab-tab';

export type TabLock = 'checking' | 'ok' | 'elsewhere';

function locks(): LockManager | null {
  return typeof navigator !== 'undefined' && navigator.locks ? navigator.locks : null;
}

export function useTabLock(): { lock: TabLock; takeOver: () => void } {
  const [lock, setLock] = useState<TabLock>(() => (locks() ? 'checking' : 'ok'));
  useEffect(() => {
    const lm = locks();
    if (!lm) return;
    lm.request(LOCK, { ifAvailable: true }, (held) => {
      if (!held) {
        setLock('elsewhere');
        return;
      }
      setLock('ok');
      // Held until the tab closes, or another tab steals it (this promise then rejects).
      return new Promise<void>(() => {});
    }).catch(() => setLock('elsewhere'));
  }, []);
  const takeOver = () => {
    const lm = locks();
    if (!lm) return;
    // Take the lock from the other tab, then start fresh so progress and saves are reread.
    void lm.request(LOCK, { steal: true }, () => undefined).finally(() => window.location.reload());
  };
  return { lock, takeOver };
}
