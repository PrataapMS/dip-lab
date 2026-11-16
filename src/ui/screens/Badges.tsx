import { BADGES, type BadgeGroup } from '../../game/badges';
import { BadgeIcon, GROUP_COLOR, LockIcon } from '../BadgeIcon';
import { BackIcon } from '../icons';
import { useProgress } from '../useProgress';

const GROUPS: { id: BadgeGroup; label: string }[] = [
  { id: 'basics', label: 'BASICS' },
  { id: 'process', label: 'GOOD HABITS' },
  { id: 'results', label: 'RESULTS' },
  { id: 'advanced', label: 'ADVANCED' },
  { id: 'habits', label: 'KEEP GOING' },
];

export function Badges() {
  const { progress } = useProgress();
  const earned = BADGES.filter((b) => progress.badges[b.id]).length;
  return (
    <>
      <header class="stack gap-8">
        <div class="row">
          <a class="icon-button" href="#/home" aria-label="Back to home">
            <BackIcon />
          </a>
          <span class="mono tiny dim">
            badges · {earned}/{BADGES.length}
          </span>
        </div>
        <h1 class="picker-title">Badges</h1>
        <p class="small dim">
          Each is earned once and is worth 50 XP. They reward good habits, not lucky bets.
        </p>
      </header>

      {GROUPS.map((g) => (
        <section key={g.id} class="stack gap-8" aria-label={g.label}>
          <h2 class="section">{g.label}</h2>
          <div class="badge-grid">
            {BADGES.filter((b) => b.group === g.id).map((b) => {
              const when = progress.badges[b.id];
              return (
                <div
                  key={b.id}
                  class={`badge-card ${when ? '' : 'locked'}`}
                  style={when ? { borderColor: GROUP_COLOR[b.group] } : undefined}
                >
                  <span
                    class="badge-card-icon"
                    style={when ? { color: GROUP_COLOR[b.group] } : undefined}
                  >
                    {when ? <BadgeIcon id={b.id} size={26} /> : <LockIcon size={22} />}
                  </span>
                  <span class="stack">
                    <span class="badge-card-name">{b.name}</span>
                    <span class="tiny dim">{b.how}</span>
                    {when && <span class="mono tiny accent">earned {when}</span>}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </>
  );
}
