import { useEffect, useState } from 'preact/hooks';
import type { Side } from '../../engine/account';
import { POINTS_PER_DAY } from '../../engine/intraday';
import { describeOrder } from '../../engine/orders';
import { money, price as fmtPrice, shares, signedMoney, signedPct, upDown } from '../format';
import { BackIcon } from '../icons';
import { LineChart } from '../LineChart';
import { NewsList } from '../NewsList';
import { dayChange } from '../marketList';
import { OrderSheet } from '../OrderSheet';
import { navigate } from '../router';
import type { Market } from '../useMarket';
import { Term } from '../Term';

function goBack(): void {
  if (history.length > 1) history.back();
  else navigate({ name: 'market' });
}

export function Stock({ market, ticker }: { market: Market; ticker: string }) {
  const { view, send } = market;
  const [range, setRange] = useState<'today' | 'run'>('today');
  const [sheet, setSheet] = useState<Side | null>(null);
  const i = view.tickerIndex.get(ticker);
  const inst = i === undefined ? undefined : view.instruments[i];

  useEffect(() => {
    send({ type: 'inspect', ticker });
    return () => send({ type: 'inspect', ticker: null });
  }, [ticker, send]);

  if (i === undefined || !inst) {
    return (
      <section class="panel">
        <p class="small">{ticker} doesn't trade in this market (it may not have been listed yet).</p>
        <a class="button ghost" href="#/market">
          Back to market
        </a>
      </section>
    );
  }

  const p = view.prices[i] ?? 0;
  const prev = view.prevCloses[i] ?? p;
  const change = dayChange(view.prices, view.prevCloses, i);
  const hist = view.history?.ticker === ticker ? view.history : null;
  const today = hist?.today.length ? hist.today : [p];
  const closes = hist ? [...hist.closes, p] : [p];
  const first = closes[0] ?? p;
  const runPct = first ? p / first - 1 : 0;
  const held = view.account?.positions.find((x) => x.ticker === ticker);
  const canShort = !!view.settings?.shorts && !!view.settings?.margin;
  const orders = view.account?.openOrders.filter((o) => o.ticker === ticker) ?? [];
  // An earnings gap shows between the close before the report and the close of its day.
  const earningsMarks = (hist?.news ?? []).filter((n) => n.kind === 'earnings').map((n) => n.day + 1);
  const upcoming = hist?.upcoming;
  const inDays = (d: number) => {
    const n = d - view.day;
    return n === 1 ? 'tomorrow' : `in ${n} trading days`;
  };
  const chips = [
    upcoming?.earnings != null ? `Earnings ${inDays(upcoming.earnings)}` : null,
    upcoming?.exDividend != null ? `Ex-dividend ${inDays(upcoming.exDividend)}` : null,
  ].filter((c): c is string => !!c);

  return (
    <>
      <div class="stock-head">
        <button type="button" class="icon-button" aria-label="Back" onClick={goBack}>
          <BackIcon />
        </button>
        <div class="stack">
          <h1 class="ticker stock-ticker">{ticker}</h1>
          <span class="small dim">
            {inst.name} · {inst.kind === 'etf' ? 'fund' : (inst.sector ?? 'stock')}
          </span>
        </div>
      </div>

      <div class="price-line">
        <span class="big">{money(p, true)}</span>
        <span class={`chg big-chg ${upDown(change)}`}>{signedPct(change)}</span>
        <span class="small dim">today</span>
      </div>

      {chips.length > 0 && (
        <div class="event-chips">
          {chips.map((c) => (
            <span key={c} class="event-chip mono tiny">
              {c}
            </span>
          ))}
        </div>
      )}

      <section class="chart-box">
        <div class="segmented range" role="group" aria-label="Chart range">
          <button type="button" aria-pressed={range === 'today'} onClick={() => setRange('today')}>
            Today
          </button>
          <button type="button" aria-pressed={range === 'run'} onClick={() => setRange('run')}>
            Run {signedPct(runPct, 1)}
          </button>
        </div>
        {range === 'today' ? (
          <LineChart
            values={today}
            capacity={POINTS_PER_DAY}
            baseline={prev}
            up={change >= 0}
            label={`${ticker} today, ${signedPct(change)}`}
            height={150}
          />
        ) : (
          <LineChart
            values={closes}
            capacity={view.dates.length + 1}
            baseline={first}
            up={runPct >= 0}
            label={`${ticker} since the run started, ${signedPct(runPct)}${earningsMarks.length ? `, ${earningsMarks.length} earnings reports marked` : ''}`}
            height={150}
            markers={earningsMarks}
          />
        )}
      </section>

      <div class="actions">
        <button type="button" class="primary" onClick={() => setSheet('buy')}>
          {held && held.shares < 0 ? 'Buy to cover' : 'Buy'}
        </button>
        <button type="button" class="ghost" disabled={!(held && held.shares > 0) && !canShort} onClick={() => setSheet('sell')}>
          {held && held.shares > 0 ? 'Sell' : canShort ? 'Short' : 'Sell'}
        </button>
      </div>

      {held && (
        <section class="panel">
          <h2 class="section">YOUR POSITION</h2>
          <dl class="facts">
            <dt>shares</dt>
            <dd>
              {shares(held.shares)}
              {held.shares < 0 ? ' (short)' : ''}
            </dd>
            <dt>
              <Term id="cost-basis">avg cost</Term>
            </dt>
            <dd>{money(held.avgCost, true)}</dd>
            <dt>value</dt>
            <dd>{money(held.value, true)}</dd>
            <dt>
              <Term id="unrealised">unrealised</Term>
            </dt>
            <dd class={upDown(held.unrealised)}>
              {signedMoney(held.unrealised, true)} ({signedPct(held.unrealisedPct)})
            </dd>
          </dl>
        </section>
      )}

      {orders.length > 0 && (
        <section class="panel">
          <h2 class="section">OPEN ORDERS</h2>
          <ul class="order-list">
            {orders.map((o) => (
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
        <h2 class="section">NEWS</h2>
        <NewsList items={hist?.news ?? []} empty={`No news about ${ticker} yet in this run.`} />
        {earningsMarks.length > 0 && range === 'run' && <p class="tiny dim">Amber dots on the chart mark earnings days.</p>}
      </section>

      <section class="panel">
        <h2 class="section">QUICK FACTS</h2>
        <dl class="facts">
          <dt>
            <Term id="sector">sector</Term>
          </dt>
          <dd>{inst.sector ?? (inst.kind === 'etf' ? 'whole market' : 'n/a')}</dd>
          <dt>
            <Term id="beta">beta</Term>
          </dt>
          <dd title="How much it tends to move with the market (1 = same as the market)">{inst.beta.toFixed(2)}</dd>
          <dt>
            <Term id="volatility">swings</Term>
          </dt>
          <dd>about {Math.round(inst.vol * 100)}% a year</dd>
          <dt>
            <Term id="yield">dividend</Term>
          </dt>
          <dd>{inst.divYield > 0 ? `${(inst.divYield * 100).toFixed(1)}% a year` : 'none'}</dd>
          <dt>prev close</dt>
          <dd>{fmtPrice(prev)}</dd>
        </dl>
        <p class="tiny dim">Simulated price. The company is real; its moves here are not.</p>
      </section>

      {sheet && <OrderSheet market={market} inst={inst} initialSide={sheet} onClose={() => setSheet(null)} />}
    </>
  );
}
