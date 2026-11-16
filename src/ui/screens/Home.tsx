import { useState } from 'preact/hooks';
import { DEFAULT_ACCOUNT_SETTINGS } from '../../engine/account';
import { DEFAULT_SPEED, SPEEDS } from '../../engine/clock';
import { SCENARIOS } from '../../engine/scenarios';
import { money, signedPct, upDown } from '../format';
import { PlayIcon, PlusIcon } from '../icons';
import { navigate } from '../router';
import { runChange, vsSpyText } from '../Shell';
import type { Market } from '../useMarket';

/** Scenarios offered on Home. Custom needs its own setup screen (later). */
const PLAYABLE = SCENARIOS.filter((s) => s.id !== 'custom');
const DEFAULT_SCENARIO = 'first-steps';

function newSeed(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return (buf[0] ?? 1) % 1_000_000;
}

function Pips({ level, boss }: { level: number; boss: boolean }) {
  return (
    <span class="pips" aria-label={`Difficulty ${level} of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} class={i <= level ? (boss ? 'on boss' : 'on') : ''} />
      ))}
    </span>
  );
}

export function Home({ market }: { market: Market }) {
  const { view, startRun, send } = market;
  const [scenarioId, setScenarioId] = useState(DEFAULT_SCENARIO);
  const scenario = PLAYABLE.find((s) => s.id === scenarioId) ?? PLAYABLE[0];
  const hasRun = view.ready && !!view.scenario;
  const run = runChange(view);
  const boss = (scenario?.difficulty ?? 0) >= 4;

  const start = () => {
    if (!scenario) return;
    if (hasRun && !view.finished && !confirm(`Leave ${view.scenario?.name} and start ${scenario.name}?`)) return;
    send({ type: 'speed', dayLengthMs: SPEEDS[DEFAULT_SPEED] });
    startRun(scenario.id, newSeed(), DEFAULT_ACCOUNT_SETTINGS);
    navigate({ name: 'market' });
  };

  return (
    <>
      <header class="home-head">
        <h1 class="logo">DIP_LAB</h1>
        <span class="mono small dim">v0.2</span>
      </header>

      {hasRun && (
        <a class="panel run-card" href="#/market">
          <div class="row">
            <span class="mono tiny accent">// {view.finished ? 'RUN COMPLETE' : 'RUN IN PROGRESS'}</span>
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
            <PlayIcon /> Resume run
          </span>
        </a>
      )}

      <section class="panel" aria-labelledby="start-title">
        <h2 id="start-title" class="title">
          {hasRun ? 'Start a new run' : 'Start a run'}
        </h2>
        <label class="field">
          <span class="label">Scenario</span>
          <select value={scenarioId} onChange={(e) => setScenarioId((e.target as HTMLSelectElement).value)}>
            {PLAYABLE.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        {scenario && (
          <div class="stack gap-6">
            <p class="small dim">{scenario.teaches}</p>
            <div class="row mono tiny dim">
              <span class="pips-row">
                difficulty <Pips level={scenario.difficulty} boss={boss} />
              </span>
              {boss && <span class="badge boss">BOSS RUN</span>}
            </div>
          </div>
        )}
        <p class="mono tiny dim">
          cash={DEFAULT_ACCOUNT_SETTINGS.startingCash} fee={DEFAULT_ACCOUNT_SETTINGS.commission} speed={DEFAULT_SPEED}
        </p>
        <button type="button" class="primary" onClick={start} disabled={view.starting && !view.ready && !view.error}>
          {hasRun ? <PlusIcon /> : <PlayIcon />} Start {scenario?.name}
        </button>
      </section>

      <p class="small dim">Prices are simulated. Nothing here is investment advice.</p>
    </>
  );
}
