import { useEffect, useRef, useState } from 'preact/hooks';
import { currentStreak } from '../game/streak';
import { exitPitch } from './exitPitch';
import { trapTab, useReturnFocus } from './focus';
import { leaveApp, stay, useExitPrompt } from './router';
import type { Market } from './useMarket';
import { today, useProgress } from './useProgress';

/** Back on Home: a playful "are you sure?" before the app closes. */
export function ExitSheet({ market }: { market: Market }) {
  if (!useExitPrompt()) return null;
  return <ExitPrompt market={market} />;
}

function ExitPrompt({ market }: { market: Market }) {
  const { view, send, saveNow } = market;
  const { progress } = useProgress();
  const stayButton = useRef<HTMLButtonElement>(null);
  const [stuck, setStuck] = useState(false);
  useReturnFocus();

  // Pause and save while the player decides; carry on playing if they stay.
  const wasPlaying = useRef(view.playing);
  useEffect(() => {
    stayButton.current?.focus();
    if (view.ready) void saveNow();
  }, []);

  const date = today();
  const quests = progress.quests?.date === date ? progress.quests.claimed : [];
  const pitch = exitPitch({
    streak: currentStreak(progress.streak, date),
    playedToday: progress.streak.last === date,
    questsLeft: 3 - quests.filter(Boolean).length,
    runOpen: view.ready && !view.finished,
  });

  const keepPlaying = () => {
    stay();
    if (wasPlaying.current) send({ type: 'play' });
  };
  const leave = () => {
    leaveApp();
    // An installed app opened straight onto this page has nowhere to go back to.
    setTimeout(() => setStuck(true), 500);
  };

  return (
    <div class="sheet-layer exit-layer">
      <button type="button" class="scrim" aria-label="Stay" onClick={keepPlaying} />
      <div
        class="sheet exit-sheet"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="exit-title"
        aria-describedby="exit-body"
        onKeyDown={(e) => {
          if (e.key === 'Escape') keepPlaying();
          trapTab(e, e.currentTarget);
        }}
      >
        <div class="grabber" aria-hidden="true" />
        <span class="exit-emoji" aria-hidden="true">
          {pitch.emoji}
        </span>
        <h2 id="exit-title" class="exit-title">
          {pitch.title}
        </h2>
        <p id="exit-body" class="small dim">
          {pitch.body}
        </p>
        {view.ready && !view.finished && <p class="mono tiny accent">&gt; run saved and paused</p>}
        <button ref={stayButton} type="button" class="button primary" onClick={keepPlaying}>
          {pitch.stay}
        </button>
        <button type="button" class="button ghost" onClick={leave}>
          {pitch.leave}
        </button>
        {stuck && (
          <p class="mono tiny dim exit-hint" role="status">
            &gt; press back once more to close Dip Lab
          </p>
        )}
      </div>
    </div>
  );
}
