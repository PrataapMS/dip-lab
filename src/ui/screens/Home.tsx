import { money, signedPct, upDown } from '../format';
import { PlayIcon, PlusIcon } from '../icons';
import { runChange, vsSpyText } from '../Shell';
import type { Market } from '../useMarket';

export function Home({ market }: { market: Market }) {
  const { view } = market;
  const hasRun = view.ready && !!view.scenario;
  const run = runChange(view);
  return (
    <>
      <header class="home-head">
        <h1 class="logo">DIP_LAB</h1>
        <span class="mono small dim">v0.2</span>
      </header>

      {hasRun && (
        <a class="panel run-card" href={view.finished ? '#/debrief' : '#/market'}>
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
            <PlayIcon /> {view.finished ? 'See your debrief' : 'Resume run'}
          </span>
        </a>
      )}

      <section class="panel" aria-labelledby="start-title">
        <h2 id="start-title" class="title">
          {hasRun ? 'Start a new run' : 'Start a run'}
        </h2>
        <p class="small dim">Ten scenarios, from a calm first quarter to the 2008 crash, plus a custom market.</p>
        <a class={`button ${hasRun ? 'ghost' : 'primary'}`} href="#/new">
          {hasRun ? <PlusIcon /> : <PlayIcon />} Pick your run
        </a>
      </section>

      <p class="small dim">Prices are simulated. Nothing here is investment advice.</p>
    </>
  );
}
