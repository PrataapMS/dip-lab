import { useEffect } from 'preact/hooks';
import { HOME, type Route, useRoute } from './ui/router';
import { navigate } from './ui/router';
import { Debrief } from './ui/screens/Debrief';
import { Home } from './ui/screens/Home';
import { Learn } from './ui/screens/Learn';
import { Market as MarketScreen } from './ui/screens/Market';
import { Portfolio } from './ui/screens/Portfolio';
import { Scenarios } from './ui/screens/Scenarios';
import { Stock } from './ui/screens/Stock';
import { Notices, RunControls, TabBar, TopBar } from './ui/Shell';
import { type Market, useMarket } from './ui/useMarket';

/** Screens that only make sense with a run loaded. */
function needsRun(r: Route): boolean {
  return r.name === 'market' || r.name === 'portfolio' || r.name === 'stock';
}

function Screen({ route, market }: { route: Route; market: Market }) {
  const { view } = market;
  if (needsRun(route) && !view.ready) {
    return <p class="mono small dim">{view.error ? `> error: ${view.error}` : '> building market…'}</p>;
  }
  switch (route.name) {
    case 'home':
      return <Home market={market} />;
    case 'learn':
      return <Learn />;
    case 'debrief':
      return <Debrief market={market} />;
    case 'new':
      return <Scenarios market={market} />;
    case 'market':
      return <MarketScreen market={market} />;
    case 'portfolio':
      return <Portfolio market={market} />;
    case 'stock':
      return <Stock key={route.ticker} market={market} ticker={route.ticker} />;
  }
}

export function App() {
  const market = useMarket();
  const { view } = market;
  const asked = useRoute();
  // Without a run (fresh start or reload), in-run screens fall back to Home.
  const route = needsRun(asked) && !view.ready && !view.starting ? HOME : asked;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route.name]);

  // When a run ends, go straight to its debrief.
  useEffect(() => {
    if (view.debrief) navigate({ name: 'debrief' });
  }, [view.debrief]);

  return (
    <div class="app">
      {needsRun(route) && view.ready && <TopBar view={view}>{route.name === 'market' && <RunControls market={market} />}</TopBar>}
      <main class="screen">
        <Screen route={route} market={market} />
      </main>
      <Notices market={market} />
      <TabBar route={route} hasRun={view.ready} />
    </div>
  );
}
