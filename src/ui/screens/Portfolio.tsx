import { describeOrder } from '../../engine/orders';
import { CompareChart, rebased } from '../CompareChart';
import { money, shares, signedMoney, signedPct, upDown } from '../format';
import { formatRoute } from '../router';
import { spyChange, spyNow } from '../Shell';
import type { Market } from '../useMarket';

/** Slices beyond this many sectors are merged into "Other". */
const MIX_SLOTS = 6;

function mixSlices(sectors: { sector: string; value: number }[], cash: number): { label: string; value: number }[] {
  const top = sectors.slice(0, MIX_SLOTS).map((s) => ({ label: s.sector, value: s.value }));
  const rest = sectors.slice(MIX_SLOTS).reduce((sum, s) => sum + s.value, 0);
  if (rest > 0) top.push({ label: 'Other', value: rest });
  if (cash > 0.005) top.push({ label: 'Cash', value: cash });
  return top;
}

export function Portfolio({ market }: { market: Market }) {
  const { view, send } = market;
  const a = view.account;
  if (!a) return <p class="mono small dim">&gt; loading account…</p>;

  const start = a.settings.startingCash;
  const today = a.value - a.prevCloseValue;
  const todayPct = a.prevCloseValue ? today / a.prevCloseValue : 0;
  const total = a.value / start - 1;
  const spy = spyChange(view);
  const curves = rebased(start, a.equityByDay, a.value, view.indexHistory, spyNow(view), view.day);
  const slices = mixSlices(a.sectorMix, a.cash);
  const mixTotal = slices.reduce((s, x) => s + x.value, 0) || 1;
  const diffPts = (total - spy) * 100;

  return (
    <>
      <h1 class="screen-title">Portfolio</h1>

      <section class="panel">
        <div class="row end">
          <div class="stack">
            <span class="tiny dim">account value</span>
            <span class="big">{money(a.value, true)}</span>
          </div>
          <div class="stack end mono">
            <span class="tiny dim">cash</span>
            <span class="value small-value">{money(a.cash, true)}</span>
          </div>
        </div>
        <dl class="facts">
          <dt>today</dt>
          <dd class={upDown(today)}>
            {signedMoney(today, true)} ({signedPct(todayPct)})
          </dd>
          <dt>total return</dt>
          <dd class={upDown(total)}>
            {signedMoney(a.value - start, true)} ({signedPct(total)})
          </dd>
          {a.dividendsReceived > 0 && (
            <>
              <dt>dividends</dt>
              <dd class="up">{signedMoney(a.dividendsReceived, true)}</dd>
            </>
          )}
          <dt>SPY same period</dt>
          <dd class={upDown(spy)}>{signedPct(spy)}</dd>
          <dt>you vs SPY</dt>
          <dd class={upDown(diffPts)}>
            {diffPts >= 0 ? '+' : '−'}
            {Math.abs(diffPts).toFixed(2)} pts
          </dd>
        </dl>
      </section>

      <section class="panel">
        <div class="row">
          <h2 class="section">YOU VS SPY</h2>
          <span class="legend mono tiny">
            <span class="key you" /> you <span class="key spy" /> SPY
          </span>
        </div>
        <CompareChart
          you={curves.you}
          spy={curves.spy}
          capacity={view.dates.length + 1}
          label={`Your account ${signedPct(total)} against SPY ${signedPct(spy)} since the start, both rebased to 100`}
        />
        <p class="tiny dim">
          Both start at 100; SPY includes its dividends. Above the dashed SPY line means you are beating buy-and-hold.
        </p>
      </section>

      <section class="panel">
        <h2 class="section">HOLDINGS</h2>
        {a.positions.length === 0 ? (
          <p class="small dim">
            No holdings yet. <a href="#/market">Open the market</a> and buy something.
          </p>
        ) : (
          <ul class="holdings">
            {a.positions.map((p) => (
              <li key={p.ticker}>
                <a href={formatRoute({ name: 'stock', ticker: p.ticker })}>
                  <span class="stack">
                    <span class="ticker">{p.ticker}</span>
                    <span class="tiny dim mono">
                      {shares(p.shares)} sh · avg {money(p.avgCost, true)}
                    </span>
                  </span>
                  <span class="stack end mono">
                    <span class="small-value">{money(p.value, true)}</span>
                    <span class={`tiny ${upDown(p.unrealised)}`}>
                      {signedMoney(p.unrealised, true)} ({signedPct(p.unrealisedPct)})
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section class="panel">
        <h2 class="section">MIX</h2>
        <div class="mix-bar" aria-hidden="true">
          {slices.map((s, k) => (
            <span key={s.label} class={s.label === 'Cash' ? 'mix-cash' : `mix-${k}`} style={{ width: `${(s.value / mixTotal) * 100}%` }} />
          ))}
        </div>
        <ul class="mix-legend">
          {slices.map((s, k) => (
            <li key={s.label}>
              <span class={`key ${s.label === 'Cash' ? 'mix-cash' : `mix-${k}`}`} />
              <span class="small">{s.label}</span>
              <span class="mono small">{((s.value / mixTotal) * 100).toFixed(1)}%</span>
            </li>
          ))}
        </ul>
      </section>

      {a.openOrders.length > 0 && (
        <section class="panel">
          <h2 class="section">OPEN ORDERS</h2>
          <ul class="order-list">
            {a.openOrders.map((o) => (
              <li key={o.id}>
                <span class="small">
                  {describeOrder(o)}
                  <span class="dim"> · {o.tif === 'gtc' ? 'until cancelled' : 'today'}</span>
                </span>
                <button type="button" class="ghost small-button" onClick={() => send({ type: 'cancelOrder', id: o.id })}>
                  Cancel
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section class="panel">
        <h2 class="section">RECENT TRADES</h2>
        {a.recentFills.length === 0 ? (
          <p class="small dim">No trades yet.</p>
        ) : (
          <ul class="fills mono">
            {a.recentFills.map((f, k) => (
              <li key={`${f.orderId}-${k}`}>
                <span class="dim">d{f.at.day + 1}</span>
                <span class={f.side === 'buy' ? 'accent' : 'down'}>{f.side}</span>
                <span>
                  {shares(f.shares)} {f.ticker}
                </span>
                <span>@ {money(f.price, true)}</span>
                {f.side === 'sell' && <span class={upDown(f.realised)}>{signedMoney(f.realised, true)}</span>}
              </li>
            ))}
          </ul>
        )}
        {a.recentDividends.length > 0 && (
          <ul class="fills mono">
            {a.recentDividends.slice(0, 5).map((d, k) => (
              <li key={`div-${k}`}>
                <span class="dim">d{d.at.day + 1}</span>
                <span class="accent">div</span>
                <span>
                  {shares(d.shares)} {d.ticker}
                </span>
                <span>× {money(d.perShare, true)}</span>
                <span class="up">{signedMoney(d.amount, true)}</span>
              </li>
            ))}
          </ul>
        )}
        <p class="tiny dim">
          Costs so far: {money(a.spreadPaid, true)} in spreads, {money(a.feesPaid, true)} in fees.
        </p>
      </section>
      {!view.finished && (
        <section class="panel">
          <h2 class="section">END THE RUN</h2>
          <p class="small dim">
            Stop here and see your debrief. Holdings are valued at today's prices and open orders are cancelled.
          </p>
          <button
            type="button"
            class="ghost danger"
            onClick={() => {
              if (confirm('End this run now and see your debrief?')) send({ type: 'end' });
            }}
          >
            End run now
          </button>
        </section>
      )}
    </>
  );
}
