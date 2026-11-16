import type { ComponentChildren } from 'preact';
import { useEffect } from 'preact/hooks';
import { BARS_PER_DAY, barTime } from '../engine/intraday';
import { money, signedMoney, signedPct, upDown, weekdayShort } from './format';
import { HomeIcon, LearnIcon, MarketIcon, PortfolioIcon } from './icons';
import { formatRoute, type Route } from './router';
import type { Market, MarketView } from './useMarket';

/** "> market open", "> market closed" or "> run complete". */
export function marketStatus(view: MarketView): string {
  if (view.finished) return 'run complete';
  return view.bar >= BARS_PER_DAY ? 'market closed' : 'market open';
}

/** Account value and its signed change since the start of the run. */
export function runChange(view: MarketView): { value: number; dollars: number; pct: number } {
  const start = view.settings?.startingCash ?? 0;
  const value = view.account?.value ?? start;
  return { value, dollars: value - start, pct: start ? value / start - 1 : 0 };
}

/** SPY's change since the run started, as a fraction. */
export function spyChange(view: MarketView): number {
  const start = view.indexHistory[0];
  const now = view.prices[view.indexInstrument];
  return start && now ? now / start - 1 : 0;
}

/** "You're ahead of SPY by 1.1 pts" (points of return). */
export function vsSpyText(view: MarketView): string {
  const diff = (runChange(view).pct - spyChange(view)) * 100;
  if (Math.abs(diff) < 0.05) return "You're level with SPY";
  return `You're ${diff > 0 ? 'ahead of' : 'behind'} SPY by ${Math.abs(diff).toFixed(1)} pts`;
}

/** Day counter, clock and account value, shown on every in-run screen. */
export function TopBar({ view, children }: { view: MarketView; children?: ComponentChildren }) {
  const date = view.dates[view.day] ?? '';
  const status = marketStatus(view);
  const run = runChange(view);
  return (
    <header class="topbar">
      <div class="topbar-row">
        <div class="stack">
          <span class="pixel accent">
            DAY {view.day + 1}/{view.dates.length}
          </span>
          <span class="mono small dim">
            {weekdayShort(date)} {barTime(view.bar)} ET ·{' '}
            <span class={status === 'market open' ? 'accent' : 'warn'}>{status}</span>
          </span>
        </div>
        <div class="stack end mono">
          <span class="value" aria-label="Account value">
            {money(run.value)}
          </span>
          <span class={`small ${upDown(run.dollars)}`}>
            {signedMoney(run.dollars)} · {signedPct(run.pct, 1)} run
          </span>
        </div>
      </div>
      {children}
    </header>
  );
}

const TABS: { route: Route; label: string; icon: () => preact.JSX.Element }[] = [
  { route: { name: 'home' }, label: 'home', icon: HomeIcon },
  { route: { name: 'market' }, label: 'market', icon: MarketIcon },
  { route: { name: 'portfolio' }, label: 'portfolio', icon: PortfolioIcon },
  { route: { name: 'learn' }, label: 'learn', icon: LearnIcon },
];

export function TabBar({ route, hasRun }: { route: Route; hasRun: boolean }) {
  const current = route.name === 'stock' ? 'market' : route.name;
  return (
    <nav class="tabbar" aria-label="Main">
      {TABS.map(({ route: r, label, icon: Icon }) => {
        const needsRun = r.name === 'market' || r.name === 'portfolio';
        return (
          <a
            key={label}
            href={needsRun && !hasRun ? formatRoute({ name: 'home' }) : formatRoute(r)}
            aria-current={current === r.name ? 'page' : undefined}
            aria-disabled={needsRun && !hasRun ? 'true' : undefined}
          >
            <Icon />
            {label}
          </a>
        );
      })}
    </nav>
  );
}

const NOTICE_MS = 4_000;

/** Order messages, newest at the bottom; each fades after a few seconds. */
export function Notices({ market }: { market: Market }) {
  const { notices } = market.view;
  const { dismissNotice } = market;
  const oldest = notices[0];
  useEffect(() => {
    if (!oldest) return;
    const t = setTimeout(() => dismissNotice(oldest.id), NOTICE_MS);
    return () => clearTimeout(t);
  }, [oldest, dismissNotice]);
  if (!notices.length) return null;
  return (
    <div class="notices" role="status" aria-live="polite">
      {notices.map((n) => (
        <button key={n.id} type="button" class={`notice ${n.ok ? '' : 'bad'}`} onClick={() => dismissNotice(n.id)}>
          <span class={n.ok ? 'accent' : 'down'}>&gt;</span> {n.message}
        </button>
      ))}
    </div>
  );
}
