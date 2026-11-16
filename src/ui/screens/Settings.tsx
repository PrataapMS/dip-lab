import { useEffect, useRef, useState } from 'preact/hooks';
import { version } from '../../../package.json';
import { emptyProgress, migrate } from '../../game/progress';
import {
  checkName,
  DAY_LENGTHS,
  migrateSettings,
  NAME_MAX,
  type PauseRule,
} from '../../game/settings';
import {
  type BackupFile,
  backupFileName,
  describeBackup,
  isFullBackup,
  makeBackup,
  parseBackup,
} from '../../storage/backup';
import { save as saveRecord } from '../../storage/db';
import {
  freeSlot,
  SLOTS,
  type SlotBody,
  type SlotHeader,
  slotToReplace,
} from '../../storage/slots';
import { deliverFile } from '../files';
import { InstallRow } from '../InstallCard';
import { OFFLINE_TEXT, useOfflineStatus } from '../offline';
import { play, setSoundEnabled, startAudio } from '../sound';
import { navigate } from '../router';
import { BackIcon } from '../icons';
import { SlotSummary } from '../Slots';
import type { Market } from '../useMarket';
import { today, useProgress } from '../useProgress';
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

function ImportPanel({
  market,
  file,
  onDone,
}: {
  market: Market;
  file: BackupFile;
  /** Closes the panel; `message` is empty when cancelled, `slot` is where a run went. */
  onDone: (message: string, slot?: number) => void;
}) {
  const { view, importRun, loadSlot, deleteSlot } = market;
  const slots = view.slots ?? Array<SlotHeader | null>(SLOTS).fill(null);
  const full = isFullBackup(file);
  const [target, setTarget] = useState(() => freeSlot(slots) ?? slotToReplace(slots));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = file.runs[0];

  const importOne = async () => {
    if (!run) return;
    const replacing = slots[target];
    if (replacing && !confirm(`Replace the saved ${replacing.scenarioName} run?`)) return;
    setBusy(true);
    try {
      await importRun(target, run);
      // The run open now was replaced: open the imported one instead.
      if (view.slot === target) loadSlot(target);
      onDone(`Imported ${run.header.scenarioName} into slot ${target + 1}.`, target);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const restoreAll = async () => {
    if (
      !confirm(
        'Restore this backup? It replaces your progress, settings and every saved run on this device.',
      )
    )
      return;
    setBusy(true);
    try {
      const runs = file.runs.slice(0, SLOTS);
      for (let i = 0; i < runs.length; i++) await importRun(i, runs[i] as SlotBody);
      for (let i = runs.length; i < SLOTS; i++) if (slots[i]) deleteSlot(i);
      await saveRecord('progress', 'player', migrate(file.progress));
      if (file.settings !== undefined)
        await saveRecord('progress', 'settings', migrateSettings(file.settings));
      // Start fresh so every screen reads the restored data.
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <div class="panel stack gap-8 import-panel" role="group" aria-label="Import">
      <span class="mono tiny accent">// IMPORT</span>
      <p class="small strong">{describeBackup(file)}</p>
      {full ? (
        <>
          <p class="tiny dim">
            Restoring replaces your progress, settings and all {SLOTS} save slots on this device.
          </p>
          <button type="button" class="primary" disabled={busy} onClick={restoreAll}>
            Restore this backup
          </button>
        </>
      ) : (
        <>
          <span class="field-label">Into slot</span>
          <div class="stack gap-6" role="radiogroup" aria-label="Save slot">
            {slots.map((h, i) => (
              <label key={i} class={`panel slot-choice ${target === i ? 'on' : ''}`}>
                <input
                  type="radio"
                  name="import-slot"
                  checked={target === i}
                  onChange={() => setTarget(i)}
                />
                {h ? <SlotSummary h={h} /> : <span class="small dim">Slot {i + 1}: empty</span>}
              </label>
            ))}
          </div>
          <button type="button" class="primary" disabled={busy} onClick={importOne}>
            {slots[target] ? 'Replace it with this run' : 'Import run'}
          </button>
        </>
      )}
      {error && (
        <p class="small down" role="alert">
          {error}
        </p>
      )}
      <button type="button" class="ghost" disabled={busy} onClick={() => onDone('')}>
        Cancel
      </button>
    </div>
  );
}

function SavesAndData({ market }: { market: Market }) {
  const { view, deleteSlot, exportSlots, loadSlot } = market;
  const { progress, settings } = useProgress();
  const storage = useStorageInfo();
  const taken = (view.slots ?? []).filter((h): h is SlotHeader => !!h);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, setPending] = useState<BackupFile | null>(null);
  const [opened, setOpened] = useState<number | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  const removeAll = () => {
    if (!taken.length) return;
    if (!confirm(`Delete all ${taken.length} saved runs? This can't be undone.`)) return;
    for (const h of taken) deleteSlot(h.slot);
  };
  const fail = (err: unknown) =>
    setMessage({ ok: false, text: err instanceof Error ? err.message : String(err) });

  const exportFile = async (slots: number[], full: boolean) => {
    setMessage(null);
    setOpened(null);
    try {
      const runs = await exportSlots(slots);
      const file = makeBackup({
        app: version,
        exportedAt: new Date().toISOString(),
        ...(full ? { progress, settings } : {}),
        runs,
      });
      const how = await deliverFile(backupFileName(file, today()), JSON.stringify(file));
      setMessage({
        ok: true,
        text: how === 'downloaded' ? 'File saved to your downloads.' : 'Shared.',
      });
    } catch (err) {
      fail(err);
    }
  };

  const chooseFile = async (e: Event) => {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    setMessage(null);
    try {
      setPending(parseBackup(await f.text()));
    } catch (err) {
      fail(err);
    }
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
              <button type="button" class="ghost grow" onClick={() => exportFile([h.slot], false)}>
                Export
              </button>
              <button
                type="button"
                class="ghost danger"
                aria-label={`Delete ${h.scenarioName}`}
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
      {pending ? (
        <ImportPanel
          market={market}
          file={pending}
          onDone={(text, slot) => {
            setPending(null);
            if (text) setMessage({ ok: true, text });
            setOpened(slot ?? null);
          }}
        />
      ) : (
        <div class="row gap-8 wrap">
          <button
            type="button"
            class="ghost grow"
            onClick={() =>
              exportFile(
                taken.map((h) => h.slot),
                true,
              )
            }
          >
            Back up everything
          </button>
          <button type="button" class="ghost grow" onClick={() => picker.current?.click()}>
            Import a file
          </button>
          <input
            ref={picker}
            type="file"
            accept="application/json,.json"
            class="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={chooseFile}
          />
        </div>
      )}
      {message && (
        <p class={`small ${message.ok ? '' : 'down'}`} role={message.ok ? 'status' : 'alert'}>
          {message.text}{' '}
          {message.ok && opened !== null && view.slot !== opened && (
            <button
              type="button"
              class="link small"
              onClick={() => {
                const h = view.slots?.[opened];
                loadSlot(opened);
                if (h && !h.finished) navigate({ name: 'market' });
              }}
            >
              Open it
            </button>
          )}
        </p>
      )}
      <p class="tiny dim">
        A backup holds your progress, settings and saved runs in one file. Keep it somewhere safe to
        move Dip Lab to another device or browser.
      </p>
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

function OfflineLine() {
  const status = useOfflineStatus();
  return (
    <p class={`small ${status === 'ready' ? 'up' : 'dim'}`} data-offline={status}>
      {status === 'ready' ? '✓ ' : ''}
      {OFFLINE_TEXT[status]}
    </p>
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
          onChange={(v) => {
            updateSettings({ sound: v === 'on' });
            if (v === 'on') {
              // Play a sample right away (this tap is allowed to start audio).
              setSoundEnabled(true);
              startAudio();
              play('chime');
            }
          }}
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
        <OfflineLine />
        <InstallRow />
        <p class="small dim">Prices are simulated. Nothing here is investment advice.</p>
        <p class="tiny dim">
          Works offline; no accounts, nothing leaves this device. App licensed GPL-3.0 or later;
          fonts (Space Grotesk, JetBrains Mono, Silkscreen) under the SIL Open Font License.
        </p>
      </section>
    </>
  );
}
