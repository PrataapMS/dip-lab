import { useState } from 'preact/hooks';
import { showInstallCard, useInstall } from './install';
import { useProgress } from './useProgress';

const IOS_STEPS = 'In Safari, tap Share, then Add to Home Screen.';

/** Home: offered once, after the first finished run. "Not now" leaves only the Settings row. */
export function InstallCard() {
  const { progress, settings, updateSettings } = useProgress();
  const install = useInstall();
  const finished = Object.values(progress.finished).reduce((a, b) => a + b, 0);
  if (!showInstallCard(install, finished, settings.installDismissed)) return null;
  const dismiss = () => updateSettings({ installDismissed: true });
  return (
    <section class="panel stack gap-8 install-card" aria-labelledby="install-title">
      <span class="mono tiny accent">// INSTALL</span>
      <h2 id="install-title" class="title">
        Install Dip Lab
      </h2>
      <p class="small dim">
        It opens full screen from your home screen and plays with no connection at all.
      </p>
      {install.canPrompt ? (
        <button
          type="button"
          class="primary"
          onClick={() => void install.prompt().then((ok) => ok && dismiss())}
        >
          Install app
        </button>
      ) : (
        <p class="small">{IOS_STEPS}</p>
      )}
      <button type="button" class="link small" onClick={dismiss}>
        Not now
      </button>
    </section>
  );
}

/** Settings: always there while the app isn't installed. */
export function InstallRow() {
  const install = useInstall();
  const [asked, setAsked] = useState(false);
  if (install.installed) return <p class="small">Installed on this device.</p>;
  if (install.canPrompt)
    return (
      <button
        type="button"
        class="ghost"
        onClick={() => {
          setAsked(true);
          void install.prompt();
        }}
      >
        Install app
      </button>
    );
  if (install.ios) return <p class="small">{IOS_STEPS}</p>;
  return (
    <p class="small dim">
      {asked
        ? 'Install from your browser menu.'
        : 'To install, use your browser menu: "Install app" or "Add to Home screen".'}
    </p>
  );
}
