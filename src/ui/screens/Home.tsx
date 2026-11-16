import { useEffect, useState } from 'preact/hooks';
import { version } from '../../../package.json';
import { BADGES } from '../../game/badges';
import { levelFor, nextUnlock } from '../../game/levels';
import { msToMidnight, questsFor } from '../../game/quests';
import { currentStreak } from '../../game/streak';
import { BadgeIcon, FlameIcon, GROUP_COLOR, LockIcon } from '../BadgeIcon';
import { money, signedPct, upDown } from '../format';
import { PlayIcon, PlusIcon } from '../icons';
import { runChange, vsSpyText } from '../Shell';
import { SavedRuns } from '../Slots';
import { UpdateAlertsOptIn } from '../UpdateBanner';
import type { Market } from '../useMarket';
import { today, useProgress } from '../useProgress';

const SHELF = 6;

function useNow(everyMs: number): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}

function hms(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}

/** Player card: level, rank and the XP bar. */
export function PlayerCard() {
  const { progress } = useProgress();
  const lv = levelFor(progress.xp);
  const unlock = nextUnlock(lv.level);
  const next = lv.nextRank
    ? `next: ${lv.nextRank}`
    : unlock
      ? `${unlock.label} at Lv ${unlock.level}`
      : `Lv ${lv.level + 1} next`;
  return (
    <section class="panel player-card" aria-label="Your level">
      <div class="row gap-12">
        <div class="avatar mono" aria-hidden="true">
          &gt;_
        </div>
        <div class="stack grow">
          <span class="mono player-name">{progress.name}</span>
          <span class="small dim">
            Lv {lv.level} · {lv.rank}
          </span>
        </div>
        <span class="lv-chip">LV {lv.level}</span>
      </div>
      <div class="stack gap-6">
        <div
          class="xp-bar"
          role="progressbar"
          aria-label="XP to the next level"
          aria-valuemin={0}
          aria-valuemax={lv.need}
          aria-valuenow={lv.into}
        >
          <span style={{ width: `${(lv.into / lv.need) * 100}%` }} />
        </div>
        <div class="row mono tiny dim">
          <span>
            {lv.into.toLocaleString('en-US')} / {lv.need.toLocaleString('en-US')} XP
          </span>
          <span>{next}</span>
        </div>
      </div>
    </section>
  );
}

function Quests() {
  const { progress } = useProgress();
  const now = useNow(1000);
  const date = today(now);
  const defs = questsFor(date);
  const state = progress.quests?.date === date ? progress.quests : null;
  return (
    <section class="stack gap-8" aria-labelledby="quests-title">
      <div class="row baseline">
        <h2 id="quests-title" class="title small-title">
          Daily quests
        </h2>
        <span class="mono tiny dim">resets in {hms(msToMidnight(now))}</span>
      </div>
      {defs.map((q, k) => {
        const done = !!state?.claimed[k];
        const at = state?.progress[k] ?? 0;
        return (
          <div key={q.id} class={`quest ${done ? 'done' : ''}`}>
            <span class="quest-check" aria-hidden="true">
              {done && (
                <svg
                  aria-hidden="true"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="3"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <polyline points="5 12 10 17 19 7" />
                </svg>
              )}
            </span>
            <div class="stack grow gap-4">
              <span class="quest-text">
                {q.text}
                {q.goal > 1 && !done && (
                  <span class="mono tiny dim">
                    {' '}
                    {at}/{q.goal}
                  </span>
                )}
              </span>
              {done ? (
                <span class="tiny dim">Done · claimed</span>
              ) : (
                <div class="quest-bar" aria-hidden="true">
                  <span style={{ width: `${(at / q.goal) * 100}%` }} />
                </div>
              )}
              <span class="sr-only">{done ? 'Done' : `${at} of ${q.goal}`}</span>
            </div>
            <span class={`mono small ${done ? 'dim' : 'xp'}`}>+{q.xp} XP</span>
          </div>
        );
      })}
    </section>
  );
}

function BadgeShelf() {
  const { progress } = useProgress();
  const earned = BADGES.filter((b) => progress.badges[b.id]).sort((a, b) =>
    (progress.badges[b.id] ?? '').localeCompare(progress.badges[a.id] ?? ''),
  );
  const slots = Array.from({ length: SHELF }, (_, k) => earned[k] ?? null);
  return (
    <section class="stack gap-8" aria-labelledby="badges-title">
      <div class="row baseline">
        <h2 id="badges-title" class="title small-title">
          Badges
        </h2>
        <a class="mono small accent" href="#/badges">
          {earned.length} / {BADGES.length}
        </a>
      </div>
      <div class="badge-shelf">
        {slots.map((b, k) =>
          b ? (
            <a
              key={b.id}
              class="badge-slot"
              href="#/badges"
              title={b.name}
              style={{ color: GROUP_COLOR[b.group], borderColor: GROUP_COLOR[b.group] }}
            >
              <BadgeIcon id={b.id} />
              <span class="sr-only">{b.name}</span>
            </a>
          ) : (
            <a key={`locked-${k}`} class="badge-slot locked" href="#/badges" title="Locked">
              <LockIcon />
              <span class="sr-only">Locked badge</span>
            </a>
          ),
        )}
      </div>
    </section>
  );
}

export function Home({ market, startTutorial }: { market: Market; startTutorial: () => void }) {
  const { view } = market;
  const { progress, update } = useProgress();
  const newcomer = !progress.tutorialDone && !progress.badges['first-trade'];
  const hasRun = view.ready && !!view.scenario;
  const run = runChange(view);
  const streak = currentStreak(progress.streak, today());
  return (
    <>
      <header class="home-head">
        <h1 class="logo">DIP_LAB</h1>
        <span class="mono small dim">v{version.split('.').slice(0, 2).join('.')}</span>
        <span
          class={`streak-pill mono ${streak ? '' : 'cold'}`}
          title={`Best: ${progress.streak.best} days`}
        >
          <FlameIcon /> {streak} day streak
        </span>
      </header>

      {newcomer && (
        <section class="panel welcome" aria-labelledby="welcome-title">
          <span class="mono tiny accent">// NEW HERE?</span>
          <h2 id="welcome-title" class="title">
            Make your first trade in under a minute
          </h2>
          <p class="small dim">
            Four taps with a guide: open the market, pick a stock, buy $1,000 of it. Simulated
            money, simulated prices.
          </p>
          <button type="button" class="primary" onClick={startTutorial}>
            <PlayIcon /> Make your first trade
          </button>
          <button
            type="button"
            class="link small"
            onClick={() => update((p) => ({ progress: { ...p, tutorialDone: true } }))}
          >
            Skip, I know this
          </button>
        </section>
      )}

      <PlayerCard />

      {hasRun && (
        <a class="panel run-card" href={view.finished ? '#/debrief' : '#/market'}>
          <div class="row">
            <span class="mono tiny accent">
              // {view.finished ? 'RUN COMPLETE' : 'RUN IN PROGRESS'}
            </span>
            <span class="mono tiny dim">
              day {view.day + 1}/{view.dates.length}
            </span>
          </div>
          <div class="row end">
            <div class="stack">
              <span class="title">{view.scenario?.name}</span>
              <span class="small dim">{vsSpyText(view)}</span>
            </div>
            <div class="stack end mono">
              <span class="value">{money(run.value)}</span>
              <span class={`small ${upDown(run.pct)}`}>{signedPct(run.pct, 1)}</span>
            </div>
          </div>
          <span class="button primary">
            <PlayIcon /> {view.finished ? 'See your debrief' : 'Resume run'}
          </span>
        </a>
      )}

      <SavedRuns market={market} />
      <Quests />
      <BadgeShelf />

      <a class={`button ${hasRun || newcomer ? 'ghost' : 'primary'}`} href="#/new">
        {hasRun ? <PlusIcon /> : <PlayIcon />} {hasRun ? 'Start a new run' : 'Pick your first run'}
      </a>

      <UpdateAlertsOptIn />
      <p class="small dim">Prices are simulated. Nothing here is investment advice.</p>
    </>
  );
}
