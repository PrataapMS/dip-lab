import type { Debrief as Report, Moment, TradeStat } from '../../engine/protocol';
import { CompareChart } from '../CompareChart';
import { endText } from '../DayCard';
import { money, MINUS, signedPct } from '../format';
import { PlusIcon, ReplayIcon } from '../icons';
import { navigate } from '../router';
import type { Market } from '../useMarket';

const MOMENT_COLOR: Record<Moment['kind'], string> = {
  soldNearLow: 'var(--down)',
  stopSlippage: 'var(--warn)',
  allIn: 'var(--xp)',
  overtrading: 'var(--warn)',
  satOut: 'var(--text-dim)',
};

function headline(d: Report): string {
  const pts = Math.abs(d.excessPts).toFixed(1);
  if (Math.abs(d.excessPts) < 0.05) return 'You matched the index';
  return d.excessPts > 0 ? `You beat the index by ${pts} pts` : `The index beat you by ${pts} pts`;
}

function tradeText(t: TradeStat | null): string {
  return t ? `${t.ticker} ${signedPct(t.pct, 0)}` : 'n/a';
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'up' | 'down' }) {
  return (
    <div class="stat">
      <span class="tiny dim">{label}</span>
      <span class={`stat-value ${tone ?? ''}`}>{value}</span>
    </div>
  );
}

export function Debrief({ market }: { market: Market }) {
  const { view, startRun } = market;
  const d = view.debrief;
  if (!d) {
    return (
      <section class="panel">
        <p class="small">No finished run yet. Finish a run, or end one from Portfolio, to see its debrief.</p>
        <a class="button ghost" href="#/home">
          Home
        </a>
      </section>
    );
  }

  const g = d.grade;
  const markers = d.moments.map((m) => ({ index: Math.min(m.day + 1, d.you.length - 1), color: MOMENT_COLOR[m.kind] }));
  const youCurve = d.you.map((v) => (v / d.startValue) * 100);
  const spyCurve = d.spy.map((v) => (v / d.startValue) * 100);
  const replay = () => {
    if (!view.config) return;
    startRun(view.config);
    navigate({ name: 'market' });
  };

  return (
    <>
      <header class="debrief-head">
        <div class={`grade-tile grade-${g.letter[0]?.toLowerCase()}`}>
          <span class="grade-letter">{g.letter}</span>
          <span class="tiny dim mono">grade</span>
        </div>
        <div class="stack gap-4">
          <span class="mono tiny accent">// RUN COMPLETE · {d.scenarioName.toUpperCase()}</span>
          <h1 class="debrief-title">{headline(d)}</h1>
        </div>
      </header>

      {d.reason !== 'lastDay' && <p class="small dim">{endText(d.reason)}</p>}

      <div class="vs-tiles mono">
        <div class="vs-tile you">
          <span class="tiny dim">you</span>
          <span class={`vs-big ${d.ret >= 0 ? 'accent' : 'down'}`}>{signedPct(d.ret, 1)}</span>
          <span class="tiny dim">
            {money(d.startValue)} → {money(d.endValue)}
          </span>
        </div>
        <div class="vs-tile">
          <span class="tiny dim">buy &amp; hold SPY</span>
          <span class="vs-big">{signedPct(d.spyRet, 1)}</span>
          <span class="tiny dim">
            {money(d.startValue)} → {money(d.spyEndValue)}
          </span>
        </div>
      </div>

      <section class="panel">
        <div class="row">
          <h2 class="title small-title">Your run vs SPY</h2>
          <span class="legend mono tiny">
            <span class="key you" /> you <span class="key spy" /> SPY
          </span>
        </div>
        <CompareChart
          you={youCurve}
          spy={spyCurve}
          capacity={youCurve.length}
          markers={markers}
          label={`Your account ${signedPct(d.ret)} against buy-and-hold SPY ${signedPct(d.spyRet)} over ${d.days} trading days${markers.length ? `, with ${markers.length} moments circled` : ''}`}
        />
        <div class="row mono tiny dim">
          <span>day 1</span>
          <span>day {d.days}</span>
        </div>
      </section>

      <section class="stack gap-8">
        <h2 class="section">STATS</h2>
        <div class="stats-grid mono">
          <Stat label="worst_drop" value={d.worstDrawdown > 0 ? `${MINUS}${(d.worstDrawdown * 100).toFixed(1)}%` : '0.0%'} tone={d.worstDrawdown > 0 ? 'down' : undefined} />
          <Stat label="trades" value={String(d.trades)} />
          <Stat label="costs_paid" value={money(d.fees + d.spread)} />
          <Stat label="win_rate" value={d.closedTrades ? `${d.wins}/${d.closedTrades}` : 'n/a'} />
          <Stat label="best" value={tradeText(d.best)} tone={d.best ? (d.best.pct >= 0 ? 'up' : 'down') : undefined} />
          <Stat label="worst" value={tradeText(d.worst)} tone={d.worst ? (d.worst.pct >= 0 ? 'up' : 'down') : undefined} />
        </div>
        <p class="tiny dim">
          SPY's worst drop was {MINUS}
          {(d.spyWorstDrawdown * 100).toFixed(1)}%. Costs are spreads plus fees
          {d.dividends > 0 ? `; you also collected ${money(d.dividends, true)} in dividends` : ''}. Best and worst count positions still held
          at their final price.
        </p>
        <p class="mono tiny dim">
          performance {Math.round(g.performance)}/40 · risk {Math.round(g.risk)}/30 · discipline {Math.round(g.discipline)}/30
        </p>
        {g.cap && <p class="small warn">{g.cap}</p>}
      </section>

      <section class="stack gap-8">
        <h2 class="section">MOMENTS TO LEARN FROM</h2>
        {d.moments.length === 0 ? (
          <p class="small dim">Nothing flagged: no panic sells, slipped stops, all-in bets or heavy costs.</p>
        ) : (
          d.moments.map((m, k) => (
            <div key={`${m.kind}-${m.day}`} class="moment" style={{ boxShadow: `inset 3px 0 0 ${MOMENT_COLOR[m.kind]}` }}>
              <div class="row">
                <span class="moment-title">
                  #{k + 1} · {m.title}
                </span>
                {m.kind !== 'satOut' && m.kind !== 'overtrading' && <span class="mono tiny dim">day {m.day + 1}</span>}
              </div>
              <span class="small moment-text">{m.lesson}</span>
            </div>
          ))
        )}
      </section>

      <div class="stack gap-8 debrief-actions">
        <button type="button" class="primary" onClick={replay} disabled={!view.config}>
          <ReplayIcon /> Replay the same market
        </button>
        <a class="button ghost" href="#/home">
          <PlusIcon /> New run
        </a>
        <p class="tiny dim">Replay uses the same seed ({d.seed}), so prices and news repeat; only your decisions change.</p>
      </div>

      <p class="tiny dim">Prices are simulated. Nothing here is investment advice.</p>
    </>
  );
}
