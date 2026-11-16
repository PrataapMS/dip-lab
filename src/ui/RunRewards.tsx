import { BADGES } from '../game/badges';
import { levelFor, nextUnlock, UNLOCKS, unlocksBetween } from '../game/levels';
import { MIN_DAYS_FOR_XP } from '../game/xp';
import { BadgeIcon, GROUP_COLOR } from './BadgeIcon';
import { useProgress } from './useProgress';

/** The debrief's rewards: level-up banner (or XP panel), what the XP came from, and new badges. */
export function RunRewards({ days }: { days: number }) {
  const { progress, run } = useProgress();
  const lv = levelFor(progress.xp);
  const total = run.rewards.reduce((s, r) => s + r.xp, 0);
  const leveled = lv.level > run.levelBefore;
  const gained = unlocksBetween(run.levelBefore, lv.level);
  const next = nextUnlock(lv.level);
  const badges = run.rewards
    .filter((r) => r.source === 'badge')
    .map((r) => BADGES.find((b) => b.id === r.id))
    .filter((b) => !!b);
  const why =
    total > 0
      ? null
      : days < MIN_DAYS_FOR_XP
        ? `Runs under ${MIN_DAYS_FOR_XP} trading days don't earn XP.`
        : 'Replays pay XP only for beating your best on the same market.';

  return (
    <>
      <section
        class={`xp-panel ${leveled ? 'level-up' : ''}`}
        aria-label={leveled ? 'Level up' : 'XP earned'}
      >
        <div class="row">
          <span class="pixel">{leveled ? 'LEVEL UP' : 'XP EARNED'}</span>
          <span class="mono strong">+{total.toLocaleString('en-US')} XP</span>
        </div>
        <span class="xp-panel-title">
          Lv {lv.level} · {lv.rank}
        </span>
        <div class="xp-bar on-panel" aria-hidden="true">
          <span style={{ width: `${(lv.into / lv.need) * 100}%` }} />
        </div>
        <span class="mono tiny">
          {lv.into.toLocaleString('en-US')} / {lv.need.toLocaleString('en-US')} XP
          {next ? ` · ${next.label} unlocks at Lv ${next.level}` : ''}
        </span>
        {gained.length > 0 && (
          <span class="small strong">
            Unlocked: {gained.map((g) => UNLOCKS[g].label).join(', ')}
          </span>
        )}
        {why && <span class="small">{why}</span>}
        {run.rewards.length > 0 && (
          <ul class="xp-lines mono tiny">
            {run.rewards.map((r, k) => (
              <li key={k}>
                <span>{r.label}</span>
                <span>+{r.xp}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {badges.length > 0 && (
        <section class="stack gap-8">
          <h2 class="section">BADGES UNLOCKED</h2>
          <div class="badge-grid">
            {badges.map((b) => (
              <div key={b.id} class="badge-card" style={{ borderColor: GROUP_COLOR[b.group] }}>
                <span class="badge-card-icon" style={{ color: GROUP_COLOR[b.group] }}>
                  <BadgeIcon id={b.id} size={26} />
                </span>
                <span class="stack">
                  <span class="badge-card-name">{b.name}</span>
                  <span class="tiny dim">{b.how}</span>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
