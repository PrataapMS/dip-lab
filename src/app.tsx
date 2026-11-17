import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { latestUnfinished } from './storage/slots';
import { DEFAULT_ACCOUNT_SETTINGS } from './engine/account';
import { Coach } from './ui/Coach';
import { ErrorScreen } from './ui/ErrorScreen';
import { ExitSheet } from './ui/ExitSheet';
import { HOME, type Route, useRoute } from './ui/router';
import { navigate } from './ui/router';
import { Badges } from './ui/screens/Badges';
import { Debrief } from './ui/screens/Debrief';
import { Home } from './ui/screens/Home';
import { Learn } from './ui/screens/Learn';
import { Market as MarketScreen } from './ui/screens/Market';
import { Portfolio } from './ui/screens/Portfolio';
import { newSeed, Scenarios } from './ui/screens/Scenarios';
import { Settings } from './ui/screens/Settings';
import { Stock } from './ui/screens/Stock';
import { Notices, RunControls, TabBar, TopBar } from './ui/Shell';
import { SlotPicker } from './ui/Slots';
import { useTabLock } from './ui/tabLock';
import { UpdateBanner } from './ui/UpdateBanner';
import { type Market, useMarket } from './ui/useMarket';
import { ProgressProvider } from './ui/useProgress';

/** Screens that only make sense with a run loaded. */
function needsRun(r: Route): boolean {
  return r.name === 'market' || r.name === 'portfolio' || r.name === 'stock';
}

function Screen({
  route,
  market,
  startTutorial,
}: {
  route: Route;
  market: Market;
  startTutorial: () => void;
}) {
  const { view } = market;
  if (needsRun(route) && !view.ready) {
    return (
      <p class="mono small dim">{view.error ? `> error: ${view.error}` : '> building market…'}</p>
    );
  }
  switch (route.name) {
    case 'home':
      return <Home market={market} startTutorial={startTutorial} />;
    case 'learn':
      return <Learn key={route.lesson ?? ''} market={market} lesson={route.lesson} />;
    case 'debrief':
      return <Debrief market={market} />;
    case 'badges':
      return <Badges />;
    case 'new':
      return <Scenarios market={market} />;
    case 'settings':
      return <Settings market={market} />;
    case 'market':
      return <MarketScreen market={market} />;
    case 'portfolio':
      return <Portfolio market={market} />;
    case 'stock':
      return <Stock key={route.ticker} market={market} ticker={route.ticker} />;
  }
}

/** Shown when Dip Lab is already open in another tab or window. */
function OpenElsewhere({ takeOver }: { takeOver: () => void }) {
  return (
    <main class="screen">
      <section class="panel stack gap-8" aria-labelledby="elsewhere-title">
        <span class="mono tiny accent">// ALREADY OPEN</span>
        <h1 id="elsewhere-title" class="title">
          Dip Lab is open in another tab or window
        </h1>
        <p class="small dim">
          Playing in two places at once could overwrite your saves and progress. Close the other
          one, or carry on here (the other one stops).
        </p>
        <button type="button" class="primary" onClick={takeOver}>
          Use Dip Lab here
        </button>
      </section>
    </main>
  );
}

export function App() {
  const market = useMarket();
  const { view } = market;
  const { lock, takeOver } = useTabLock();

  // Another tab took over: stop playing and saving here.
  useEffect(() => {
    if (lock === 'elsewhere') market.send({ type: 'detach' });
  }, [lock, market.send]);

  // On start, reopen the run played last (paused), so Resume is one tap.
  const resumed = useRef(false);
  useEffect(() => {
    if (resumed.current || lock !== 'ok' || !view.slots) return;
    resumed.current = true;
    const last = latestUnfinished(view.slots);
    if (last && !view.ready && !view.starting) market.loadSlot(last.slot);
  }, [lock, view.slots, view.ready, view.starting, market.loadSlot]);
  const asked = useRoute();
  // Without a run (fresh start or reload), in-run screens fall back to Home.
  const route = needsRun(asked) && !view.ready && !view.starting ? HOME : asked;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route.name]);

  const [coaching, setCoaching] = useState(false);
  const startTutorial = useCallback(() => {
    market.startRun({
      scenarioId: 'first-steps',
      seed: newSeed(),
      settings: DEFAULT_ACCOUNT_SETTINGS,
    });
    navigate({ name: 'market' });
    setCoaching(true);
  }, [market.startRun]);

  // When a run ends, go straight to its debrief.
  useEffect(() => {
    if (view.debrief) navigate({ name: 'debrief' });
  }, [view.debrief]);

  if (view.crash) return <ErrorScreen error={view.crash} engine />;
  if (lock === 'elsewhere') return <OpenElsewhere takeOver={takeOver} />;
  if (lock === 'checking') return null;

  return (
    <ProgressProvider market={market}>
      <div class="app">
        {needsRun(route) && view.ready && (
          <TopBar view={view}>{route.name === 'market' && <RunControls market={market} />}</TopBar>
        )}
        <main class="screen">
          <UpdateBanner hasRun={view.ready && !view.finished} beforeUpdate={market.saveNow} />
          <Screen route={route} market={market} startTutorial={startTutorial} />
        </main>
        <Notices market={market} />
        <SlotPicker market={market} />
        <ExitSheet market={market} />
        {coaching && view.ready && (
          <Coach route={route} market={market} onClose={() => setCoaching(false)} />
        )}
        <TabBar route={route} hasRun={view.ready} />
      </div>
    </ProgressProvider>
  );
}
