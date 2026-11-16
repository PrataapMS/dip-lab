import { useEffect, useRef, useState } from 'preact/hooks';
import { SLOTS, type SlotHeader, slotToReplace } from '../storage/slots';
import { money, signedPct, upDown } from './format';
import { CloseIcon } from './icons';
import { navigate } from './router';
import type { Market } from './useMarket';

/** "Day 41 of 220 · +3.2% · 1.4 pts ahead of SPY" or "Finished · B+". */
function slotLine(h: SlotHeader): string {
  const pct = h.value / h.startingCash - 1;
  if (h.finished) return `Finished${h.letter ? ` · grade ${h.letter}` : ''}`;
  const diff = (pct - h.spyReturn) * 100;
  const vs =
    Math.abs(diff) < 0.05
      ? 'level with SPY'
      : `${Math.abs(diff).toFixed(1)} pts ${diff > 0 ? 'ahead of' : 'behind'} SPY`;
  return `Day ${h.day + 1} of ${h.totalDays} · ${vs}`;
}

function savedWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
}

export function SlotSummary({ h }: { h: SlotHeader }) {
  const pct = h.value / h.startingCash - 1;
  return (
    <div class="row end slot-summary">
      <div class="stack">
        <span class="small strong">
          {h.scenarioName}
          {h.branchDay !== null ? ' (replay)' : ''}
          {h.config.challenge ? ' (challenge)' : ''}
        </span>
        <span class="tiny dim">{slotLine(h)}</span>
        <span class="tiny dim mono">saved {savedWhen(h.savedAt)}</span>
      </div>
      <div class="stack end mono">
        <span class="small">{money(h.value)}</span>
        <span class={`tiny ${upDown(pct)}`}>{signedPct(pct, 1)}</span>
      </div>
    </div>
  );
}

/** Home: the saved runs other than the one loaded now, with Open and Delete. */
export function SavedRuns({ market }: { market: Market }) {
  const { view, loadSlot, deleteSlot } = market;
  const slots = view.slots;
  if (!slots) return null;
  const current = view.ready ? view.slot : null;
  const others = slots.filter((h): h is SlotHeader => !!h && h.slot !== current);
  const empty = slots.filter((h) => !h).length;
  if (!others.length) return null;
  const open = (h: SlotHeader) => {
    loadSlot(h.slot);
    // A finished run goes to its debrief by itself once loaded.
    if (!h.finished) navigate({ name: 'market' });
  };
  const remove = (h: SlotHeader) => {
    if (confirm(`Delete the saved ${h.scenarioName} run? This can't be undone.`))
      deleteSlot(h.slot);
  };
  return (
    <section class="panel stack gap-8" aria-labelledby="saved-title">
      <div class="row baseline">
        <h2 id="saved-title" class="mono tiny accent">
          // SAVED RUNS
        </h2>
        <span class="tiny dim mono">
          {SLOTS - empty}/{SLOTS} slots
        </span>
      </div>
      {others.map((h) => (
        <div key={h.slot} class="stack gap-6 slot-row">
          <SlotSummary h={h} />
          <div class="row gap-8">
            <button type="button" class="ghost grow" onClick={() => open(h)}>
              {h.finished ? 'See debrief' : 'Resume'}
            </button>
            <button
              type="button"
              class="ghost danger"
              aria-label={`Delete ${h.scenarioName}`}
              onClick={() => remove(h)}
            >
              Delete
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}

/** All slots are full: pick the run the new one replaces. */
export function SlotPicker({ market }: { market: Market }) {
  const { view, startRun, cancelSlotPick } = market;
  const pending = view.slotPick;
  const slots = view.slots ?? [];
  const [picked, setPicked] = useState(() => slotToReplace(slots));
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (pending) setPicked(slotToReplace(slots));
    first.current?.focus();
  }, [pending]);
  if (!pending) return null;
  return (
    <div class="sheet-layer">
      <button type="button" class="scrim" aria-label="Cancel" onClick={cancelSlotPick} />
      <div
        class="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="slot-pick-title"
        onKeyDown={(e) => {
          if (e.key === 'Escape') cancelSlotPick();
        }}
      >
        <div class="row">
          <span class="mono tiny accent">// SAVE SLOTS FULL</span>
          <button
            ref={first}
            type="button"
            class="icon-button"
            aria-label="Cancel"
            onClick={cancelSlotPick}
          >
            <CloseIcon />
          </button>
        </div>
        <h2 id="slot-pick-title" class="title">
          Which run should the new one replace?
        </h2>
        <div class="stack gap-8" role="radiogroup" aria-label="Save slots">
          {slots.map(
            (h) =>
              h && (
                <label key={h.slot} class={`panel slot-choice ${picked === h.slot ? 'on' : ''}`}>
                  <input
                    type="radio"
                    name="slot"
                    checked={picked === h.slot}
                    onChange={() => setPicked(h.slot)}
                  />
                  <SlotSummary h={h} />
                </label>
              ),
          )}
        </div>
        <button
          type="button"
          class="primary"
          onClick={() => startRun({ ...pending, slot: picked })}
        >
          Replace it and start
        </button>
        <p class="tiny dim">The replaced run is deleted.</p>
      </div>
    </div>
  );
}
