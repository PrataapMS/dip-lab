import { useEffect, useState } from 'preact/hooks';
import type { Route } from './router';
import type { Market } from './useMarket';
import { useProgress } from './useProgress';

/** The stock the guided first trade uses: first on the default watchlist. */
export const TUTORIAL_TICKER = 'AAPL';

type Step = 'market' | 'stock' | 'sheet' | 'done';

const TEXT: Record<Step, string> = {
  market: `This is the market. Prices move while the clock runs (it's paused now). Tap ${TUTORIAL_TICKER}.`,
  stock: `${TUTORIAL_TICKER}'s price and chart. Tap Buy.`,
  sheet: `The button says exactly what will happen. Tap it to buy $1,000 of ${TUTORIAL_TICKER}.`,
  done: `You own ${TUTORIAL_TICKER}. Press play to watch prices move; Portfolio shows how you're doing against the market.`,
};

const TARGET: Record<Step, string | null> = {
  market: `[data-coach="quote-${TUTORIAL_TICKER}"]`,
  stock: '[data-coach="buy"]',
  sheet: '.sheet .confirm',
  done: '[aria-label="Play"]',
};

/** Where the player is in the walk-through, from what is on screen. */
function stepOf(route: Route, market: Market): Step {
  if (market.view.account?.positions.some((p) => p.ticker === TUTORIAL_TICKER)) return 'done';
  if (document.querySelector('.sheet .confirm')) return 'sheet';
  if (route.name === 'stock' && route.ticker === TUTORIAL_TICKER) return 'stock';
  return 'market';
}

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * The guided first trade: a callout and a ring around the one thing to tap next. It follows
 * the player rather than driving the app, so normal taps do all the work. Skip ends it.
 */
export function Coach({
  route,
  market,
  onClose,
}: {
  route: Route;
  market: Market;
  onClose: () => void;
}) {
  const { update } = useProgress();
  const [step, setStep] = useState<Step>('market');
  const [box, setBox] = useState<Box | null>(null);

  useEffect(() => {
    const tick = () => {
      const s = stepOf(route, market);
      setStep(s);
      const sel = TARGET[s];
      const el = sel ? document.querySelector<HTMLElement>(sel) : null;
      const r = el?.getBoundingClientRect();
      setBox(
        r && r.width > 0 ? { top: r.top, left: r.left, width: r.width, height: r.height } : null,
      );
    };
    tick();
    const t = setInterval(tick, 150);
    return () => clearInterval(t);
  }, [route, market]);

  const finish = () => {
    update((p) => ({ progress: { ...p, tutorialDone: true } }));
    onClose();
  };

  const low = box ? box.top + box.height / 2 > window.innerHeight * 0.55 : false;
  const n = { market: 1, stock: 2, sheet: 3, done: 4 }[step];
  return (
    <div class="coach" aria-live="polite">
      {box && step !== 'done' && (
        <div
          class={`coach-ring ${step === 'sheet' ? '' : 'dim'}`}
          style={{
            top: `${box.top - 6}px`,
            left: `${box.left - 6}px`,
            width: `${box.width + 12}px`,
            height: `${box.height + 12}px`,
          }}
          aria-hidden="true"
        />
      )}
      <div class={`coach-card ${low ? 'top' : 'bottom'}`} role="status">
        <div class="row">
          <span class="mono tiny accent">// FIRST TRADE · {n}/4</span>
          {step !== 'done' && (
            <button type="button" class="link tiny" onClick={finish}>
              Skip
            </button>
          )}
        </div>
        <p class="small">{TEXT[step]}</p>
        {step === 'done' && (
          <button type="button" class="primary" onClick={finish}>
            Got it
          </button>
        )}
      </div>
    </div>
  );
}
