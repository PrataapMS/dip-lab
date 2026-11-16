import type { EndReason } from '../engine/protocol';
import { longDate, signedMoney, signedPct, upDown } from './format';
import { CloseIcon, PlayIcon } from './icons';
import type { Market } from './useMarket';

const END_TEXT: Record<EndReason, string> = {
  lastDay: 'The scenario reached its last day.',
  ended: 'You ended the run.',
  bust: 'Your account fell to 10% of its starting value, so the run is over.',
  target: 'You hit your target return.',
};

export function endText(reason: EndReason): string {
  return END_TEXT[reason];
}

/** Summary of the latest close, with a toggle to pause at every close. */
export function DayCard({ market }: { market: Market }) {
  const { view, send, dismissSummary } = market;
  const s = view.daySummary;
  if (!s || view.finished) return null;
  const paused = !view.playing && view.day === s.day;
  return (
    <section class="panel day-card" aria-labelledby="day-card-title">
      <div class="row">
        <h2 id="day-card-title" class="section">
          DAY {s.day + 1} CLOSE · {longDate(s.date)}
        </h2>
        <button type="button" class="icon-button" aria-label="Hide the day summary" onClick={dismissSummary}>
          <CloseIcon />
        </button>
      </div>
      <dl class="facts">
        <dt>you</dt>
        <dd class={upDown(s.change)}>
          {signedMoney(s.change, true)} ({signedPct(s.changePct)})
        </dd>
        <dt>SPY</dt>
        <dd class={upDown(s.spyPct)}>{signedPct(s.spyPct)}</dd>
        {s.best && (
          <>
            <dt>best holding</dt>
            <dd class={upDown(s.best.pct)}>
              {s.best.ticker} {signedPct(s.best.pct, 1)}
            </dd>
          </>
        )}
        {s.worst && (
          <>
            <dt>worst holding</dt>
            <dd class={upDown(s.worst.pct)}>
              {s.worst.ticker} {signedPct(s.worst.pct, 1)}
            </dd>
          </>
        )}
        {s.trades > 0 && (
          <>
            <dt>trades</dt>
            <dd>{s.trades}</dd>
          </>
        )}
        {s.dividends > 0 && (
          <>
            <dt>dividends</dt>
            <dd class="up">{signedMoney(s.dividends, true)}</dd>
          </>
        )}
      </dl>
      {s.headline && <p class="mono small warn">&gt; {s.headline}</p>}
      {s.reportsTomorrow.length > 0 && (
        <p class="small">Reporting earnings before tomorrow's open: {s.reportsTomorrow.join(', ')}. Expect a price gap.</p>
      )}
      <div class="row">
        <label class="check small">
          <input type="checkbox" checked={view.pauseAtClose} onChange={(e) => send({ type: 'pauseAtClose', on: (e.target as HTMLInputElement).checked })} />
          pause at each close
        </label>
        {paused && (
          <button type="button" class="primary small-button" onClick={() => send({ type: 'play' })}>
            <PlayIcon /> Next day
          </button>
        )}
      </div>
    </section>
  );
}

/** Shown on Market once the run is over. */
export function RunOverCard({ market }: { market: Market }) {
  const { view } = market;
  if (!view.finished) return null;
  return (
    <section class="panel run-over">
      <span class="mono tiny accent">// RUN COMPLETE</span>
      <p class="small">{endText(view.endReason ?? 'lastDay')}</p>
      <a class="button primary" href="#/home">
        Start a new run
      </a>
    </section>
  );
}
