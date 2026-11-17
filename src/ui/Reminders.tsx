import { useState } from 'preact/hooks';
import { REMINDER_HOURS, shouldOfferReminders } from '../game/reminders';
import { FlameIcon } from './BadgeIcon';
import { enableReminders, notificationPermission, sendTestReminder } from './streakReminders';
import { Choice } from './screens/Scenarios';
import { useProgress } from './useProgress';

const ON_OFF: { value: 'on' | 'off'; label: string }[] = [
  { value: 'on', label: 'On' },
  { value: 'off', label: 'Off' },
];

function hourLabel(hour: number): string {
  return REMINDER_HOURS.find((h) => h.value === hour)?.label ?? `${hour}:00`;
}

/** Turn reminders on (asking the browser first) and remember the answer. */
function useTurnOn() {
  const { updateSettings } = useProgress();
  const [permission, setPermission] = useState(notificationPermission);
  const turnOn = () =>
    enableReminders().then((p) => {
      setPermission(p);
      if (p === 'granted') updateSettings({ reminders: true });
      return p;
    });
  return { permission, turnOn };
}

/** Settings: streak reminders on or off, and at what time. */
export function ReminderSettings() {
  const { settings, updateSettings } = useProgress();
  const { permission, turnOn } = useTurnOn();
  const [tested, setTested] = useState(false);
  const on = settings.reminders && permission === 'granted';
  return (
    <section class="panel stack gap-8" aria-labelledby="reminders-title">
      <h2 id="reminders-title" class="mono tiny accent">
        // REMINDERS
      </h2>
      {permission === null ? (
        <p class="small dim">This browser can't show notifications, so reminders are off.</p>
      ) : (
        <>
          <Choice
            label="Streak reminders"
            value={on ? 'on' : 'off'}
            options={ON_OFF}
            onChange={(v) => {
              if (v === 'off') updateSettings({ reminders: false });
              else void turnOn();
            }}
          />
          {on && (
            <>
              <Choice
                label="Remind me at"
                value={settings.reminderHour}
                options={REMINDER_HOURS}
                onChange={(h) => updateSettings({ reminderHour: h })}
              />
              <button
                type="button"
                class="link small"
                onClick={() => void sendTestReminder().then(() => setTested(true))}
              >
                {tested ? 'Test sent' : 'Send a test reminder'}
              </button>
            </>
          )}
          {permission === 'denied' && (
            <p class="small down">
              Notifications are blocked for Dip Lab. Allow them in your browser's site settings,
              then turn reminders on.
            </p>
          )}
          <p class="tiny dim">
            One nudge when your streak is about to end, at most two more if you miss days, then
            quiet. Works best with Dip Lab installed; phones may deliver reminders late.
          </p>
        </>
      )}
    </section>
  );
}

/** Home: once a streak is going, offer to protect it with a reminder. */
export function ReminderOffer({ streak }: { streak: number }) {
  const { settings, updateSettings } = useProgress();
  const { permission, turnOn } = useTurnOn();
  const offer = shouldOfferReminders({
    streak,
    enabled: settings.reminders && permission === 'granted',
    dismissed: settings.reminderOfferDismissed,
    supported: permission !== null,
    permission,
  });
  if (!offer) return null;
  const dismiss = () => updateSettings({ reminderOfferDismissed: true });
  return (
    <section class="panel reminder-offer" aria-labelledby="reminder-offer-title">
      <span class="mono tiny warn">
        <FlameIcon /> // KEEP IT GOING
      </span>
      <h2 id="reminder-offer-title" class="title">
        Protect your {streak}-day streak
      </h2>
      <p class="small dim">
        Get one reminder at {hourLabel(settings.reminderHour)} on a day your streak is about to end.
        Change the time or stop it in Settings.
      </p>
      <div class="row gap-8">
        <button
          type="button"
          class="primary"
          onClick={() =>
            void turnOn().then((p) => {
              if (p !== 'granted') dismiss();
            })
          }
        >
          Remind me
        </button>
        <button type="button" class="ghost" onClick={dismiss}>
          Not now
        </button>
      </div>
    </section>
  );
}
