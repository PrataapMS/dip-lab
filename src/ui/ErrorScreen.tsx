import { Component, type ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { version } from '../../package.json';
import { backupFileName, makeBackup } from '../storage/backup';
import { load } from '../storage/db';
import { readSlot } from '../storage/saves';
import { SLOTS } from '../storage/slots';
import { deliverFile } from './files';
import { today } from './useProgress';

/** Asks the engine to save the open run now; set by `useMarket` while the engine runs. */
let flushRun: (() => void) | null = null;

export function setCrashFlush(fn: (() => void) | null): void {
  flushRun = fn;
}

function messageOf(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const head = `${err.name}: ${err.message}`;
  if (!err.stack) return head;
  return err.stack.startsWith(head) ? err.stack : `${head}\n${err.stack}`;
}

/** Reads everything straight from the device, so it works even when the engine has stopped. */
async function backUpEverything(): Promise<string> {
  const [progress, settings, ...runs] = await Promise.all([
    load('progress', 'player'),
    load('progress', 'settings'),
    ...Array.from({ length: SLOTS }, (_, s) => readSlot(s)),
  ]);
  const file = makeBackup({
    app: version,
    exportedAt: new Date().toISOString(),
    ...(progress ? { progress, settings: settings ?? undefined } : {}),
    runs: runs.filter((r) => r !== null),
  });
  const how = await deliverFile(backupFileName(file, today()), JSON.stringify(file));
  return how === 'downloaded' ? 'Backup saved to your downloads.' : 'Backup shared.';
}

/**
 * What the player sees instead of a blank page when something breaks: the run is safe, how to
 * carry on, and the error itself to copy (nothing is sent anywhere).
 */
export function ErrorScreen({ error, engine = false }: { error: string; engine?: boolean }) {
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    if (!engine) flushRun?.();
  }, [engine]);
  const backUp = () =>
    backUpEverything().then(setNote, (e) => setNote(`Couldn't back up: ${messageOf(e)}`));
  const copy = () =>
    navigator.clipboard?.writeText(error).then(
      () => setNote('Error copied.'),
      () => setNote('Select the text below to copy it.'),
    );
  return (
    <main class="screen">
      <section class="panel stack gap-8" aria-labelledby="crash-title" role="alert">
        <span class="mono tiny warn">// SOMETHING WENT WRONG</span>
        <h1 id="crash-title" class="title">
          Dip Lab hit an error
        </h1>
        <p class="small">
          {engine
            ? 'The market engine stopped. Your run was saved at its last autosave (at most a few seconds of play are lost).'
            : 'Your run is saved. Reload to carry on from where you were.'}
        </p>
        <button type="button" class="primary" onClick={() => location.reload()}>
          Reload Dip Lab
        </button>
        <button type="button" class="ghost" onClick={backUp}>
          Back up everything to a file
        </button>
        {note && <p class="small dim">{note}</p>}
        <details class="crash-details">
          <summary class="small">Error details</summary>
          <pre class="mono tiny">{error}</pre>
          <button type="button" class="link" onClick={copy}>
            copy error
          </button>
        </details>
        <p class="tiny dim">Nothing is sent anywhere. Dip Lab {version}</p>
      </section>
    </main>
  );
}

/** Errors thrown by the app's own scripts, not by browser extensions or other pages. */
function ours(e: ErrorEvent): boolean {
  return !!e.error && (!e.filename || e.filename.startsWith(location.origin));
}

/** Shows `ErrorScreen` when rendering throws or the app's code fails outside a render. */
export class CrashGuard extends Component<
  { children: ComponentChildren },
  { error: string | null }
> {
  override state = { error: null as string | null };

  static getDerivedStateFromError(err: unknown) {
    return { error: messageOf(err) };
  }

  private readonly onError = (e: ErrorEvent) => {
    if (ours(e) && !this.state.error) this.setState({ error: messageOf(e.error) });
  };

  override componentDidMount() {
    window.addEventListener('error', this.onError);
  }

  override componentWillUnmount() {
    window.removeEventListener('error', this.onError);
  }

  override render() {
    return this.state.error ? <ErrorScreen error={this.state.error} /> : this.props.children;
  }
}
