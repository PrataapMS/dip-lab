import { useEffect, useState } from 'preact/hooks';
import { version } from '../../../package.json';
import { emptyProgress } from '../../game/progress';
import { checkName, DAY_LENGTHS, NAME_MAX, type PauseRule } from '../../game/settings';
import { SLOTS, type SlotHeader } from '../../storage/slots';
import { BackIcon } from '../icons';
import { SlotSummary } from '../Slots';
import type { Market } from '../useMarket';
import { useProgress } from '../useProgress';
import { Choice } from './Scenarios';

const PAUSE: { value: PauseRule; label: string }[] = [
  { value: 'auto', label: 'Short runs' },
  { value: 'always', label: 'Always' },
  { value: 'never', label: 'Never' },
];
const SOUND: { value: 'on' | 'off'; label: string }[] = [
  { value: 'on', label: 'On' },
  { value: 'off', label: 'Off' },
];

function mb(bytes: number): string {
  return bytes < 1_000_000
    ? `${Math.max(1, Math.round(bytes / 1000))} KB`
    : `${(bytes / 1e6).toFixed(1)} MB`;
}

/** How much the app stores on this device, and whether the browser promised to keep it. */
function useStorageInfo(): { usage: number | null; persisted: boolean | null } {
  const [info, setInfo] = useState<{ usage: number | null; persisted: boolean | null }>({
    usage: null,
    persisted: null,
  });
  useEffect(() => {
    const s = navigator.storage;
    if (!s) return;
    void Promise.all([s.estimate?.().catch(() => null), s.persisted?.().catch(() => null)]).then(
      ([e, p]) => setInfo({ usage: e?.usage ?? null, persisted: p ?? null }),
    );
  }, []);
  return info;
}

function PlayerName() {
  const { progress, update } = useProgress();
  const [draft, setDraft] = useState(progress.name);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const commit = () => {
    const r = checkName(draft);
    if ('error' in r) {
      setError(r.error);
      return;
    }
    setError(null);
    setDraft(r.name);
    if (r.name !== progress.name) {
      update((p) => ({ progress: { ...p, name: r.name } }));
      setSaved(true);
    }
  };
  return (
    <label class="field">
      <span class="field-label">Player name</span>
      <input
        type="text"
        class="mono"
        value={draft}
        maxLength={NAME_MAX + 4}
        autoComplete="off"
        spellcheck={false}
        aria-invalid={!!error}
        onInput={(e) => {
          setDraft((e.target as HTMLInputElement).value);
          setSaved(false);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
      />
      {error ? (
        <span class="tiny down" role="alert">
          {error}
        </span>
      ) : (
        <span class="tiny dim">
          {saved ? 'Saved.' : `Up to ${NAME_MAX} letters, digits, _ or -.`}
        </span>
      )}
    </label>
  );
}

function SavesAndData({ market }: { market: Market }) {
  const { view, deleteSlot } = market;
  const storage = useStorageInfo();
  const taken = (view.slots ?? []).filter((h): h is SlotHeader => !!h);
  const removeAll = () => {
    if (!taken.length) return;
    if (!confirm(`Delete all ${taken.length} saved runs? This can't be undone.`)) return;
    for (const h of taken) deleteSlot(h.slot);
  };
  return (
    <section class="panel stack gap-8" aria-labelledby="data-title">
      <h2 id="data-title" class="mono tiny accent">
        // SAVES AND DATA
      </h2>
      <p class="small dim">Runs save themselves as you play, in {SLOTS} slots on this device.</p>
      {taken.length ? (
        taken.map((h) => (
          <div key={h.slot} class="slot-row stack gap-6">
            <SlotSummary h={h} />
            <div class="row gap-8">
              <button
                type="button"
                class="ghost danger"
                onClick={() => {
                  if (confirm(`Delete the saved ${h.scenarioName} run? This can't be undone.`))
                    deleteSlot(h.slot);
                }}
              >
                Delete
              </button>
            </div>
          </div>
        ))
      ) : (
        <p class="small">No saved runs yet.</p>
      )}
      {taken.length > 1 && (
        <button type="button" class="ghost danger" onClick={removeAll}>
          Delete all saves
        </button>
      )}
      <p class="tiny dim mono">
        {storage.usage !== null ? `stored on this device: ${mb(storage.usage)}` : ''}
        {storage.persisted === true ? ' · kept by the browser' : ''}
        {storage.persisted === false ? ' · the browser may clear it if space runs low' : ''}
      </p>
    </section>
  );
}

function ResetProgress() {
  const { update } = useProgress();
  const [armed, setArmed] = useState(false);
  const [done, setDone] = useState(false);
  const reset = () => {
    update((p) => ({
      progress: { ...emptyProgress(), name: p.name, unlockAll: p.unlockAll },
    }));
    setArmed(false);
    setDone(true);
  };
  return (
    <section class="panel stack gap-8" aria-labelledby="reset-title">
      <h2 id="reset-title" class="mono tiny accent">
        // PROGRESS
      </h2>
      <p class="small dim">
        Reset clears XP, levels, badges, quests, streak, lessons, challenges and the first-trade
        guide. Your name, settings and saved runs stay.
      </p>
      {done && (
        <p class="small" role="status">
          Progress reset. Back to Lv 1.
        </p>
      )}
      {armed ? (
        <div class="row gap-8">
          <button type="button" class="primary danger-fill grow" onClick={reset}>
            Yes, reset everything
          </button>
          <button type="button" class="ghost" onClick={() => setArmed(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <button type="button" class="ghost danger" onClick={() => setArmed(true)}>
          Reset progress
        </button>
      )}
    </section>
  );
}

export function Settings({ market }: { market: Market }) {
  const { view, send } = market;
  const { progress, update, settings, updateSettings } = useProgress();
  const setDayLength = (ms: number) => {
    updateSettings({ dayLengthMs: ms });
    // The run in progress follows too.
    if (view.ready && !view.finished) send({ type: 'speed', dayLengthMs: ms });
  };
  return (
    <>
      <header class="stack gap-8">
        <div class="row">
          <a class="icon-button" href="#/home" aria-label="Back to home">
            <BackIcon />
          </a>
          <span class="mono tiny dim">settings</span>
        </div>
        <h1 class="picker-title">Settings</h1>
      </header>

      <section class="panel stack gap-8" aria-label="Player">
        <PlayerName />
      </section>

      <section class="panel stack gap-8" aria-labelledby="clock-title">
        <h2 id="clock-title" class="mono tiny accent">
          // CLOCK
        </h2>
        <Choice
          label="Day length"
          value={settings.dayLengthMs}
          options={DAY_LENGTHS.map((d) => ({ value: d.ms, label: d.label }))}
          onChange={setDayLength}
        />
        <p class="tiny dim">
          For new runs and the one you are playing. The clock only runs while the app is open.
        </p>
        <Choice
          label="Pause at each close"
          value={settings.pauseAtClose}
          options={PAUSE}
          onChange={(v) => updateSettings({ pauseAtClose: v })}
        />
        <p class="tiny dim">
          "Short runs" pauses on runs up to 70 trading days, so you can read the day summary.
        </p>
      </section>

      <section class="panel stack gap-8" aria-labelledby="sound-title">
        <h2 id="sound-title" class="mono tiny accent">
          // SOUND
        </h2>
        <Choice
          label="Sound effects"
          value={settings.sound ? 'on' : 'off'}
          options={SOUND}
          onChange={(v) => updateSettings({ sound: v === 'on' })}
        />
      </section>

      <SavesAndData market={market} />
      <ResetProgress />

      <section class="panel stack gap-8" aria-labelledby="testing-title">
        <h2 id="testing-title" class="mono tiny accent">
          // TESTING
        </h2>
        <label class="check small">
          <input
            type="checkbox"
            checked={progress.unlockAll}
            onChange={(e) => {
              const on = (e.target as HTMLInputElement).checked;
              update((p) => ({ progress: { ...p, unlockAll: on } }));
            }}
          />
          Unlock every scenario and tool, whatever your level
        </label>
      </section>

      <section class="panel stack gap-6" aria-labelledby="about-title">
        <h2 id="about-title" class="mono tiny accent">
          // ABOUT
        </h2>
        <span class="mono small">Dip Lab v{version}</span>
        <p class="small dim">Prices are simulated. Nothing here is investment advice.</p>
        <p class="tiny dim">
          Works offline; no accounts, nothing leaves this device. App licensed GPL-3.0 or later;
          fonts (Space Grotesk, JetBrains Mono, Silkscreen) under the SIL Open Font License.
        </p>
      </section>
    </>
  );
}
