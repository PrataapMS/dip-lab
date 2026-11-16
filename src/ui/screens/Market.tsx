import { useEffect, useMemo, useState } from 'preact/hooks';
import { BARS_PER_DAY, barTime } from '../../engine/intraday';
import type { InstrumentInfo } from '../../engine/protocol';
import { price, signedPct, upDown } from '../format';
import { dayChange, defaultWatchlist, INDEX_TILES, inSector, searchInstruments, SECTOR_CHIPS, topMovers } from '../marketList';
import { DayCard, RunOverCard } from '../DayCard';
import { NewsList } from '../NewsList';
import { formatRoute } from '../router';
import { MarginBanner } from '../Shell';
import { Sparkline } from '../Sparkline';
import type { Market as MarketApi, MarketView } from '../useMarket';

/** Rows shown for a sector chip; a sector can hold 70+ stocks. */
const SECTOR_LIMIT = 40;

function QuoteRow({ inst, view }: { inst: InstrumentInfo; view: MarketView }) {
  const i = view.tickerIndex.get(inst.ticker) ?? -1;
  const p = view.prices[i] ?? 0;
  const change = dayChange(view.prices, view.prevCloses, i);
  const spark = view.watch[inst.ticker];
  return (
    <li>
      <a class="quote-row" href={formatRoute({ name: 'stock', ticker: inst.ticker })} data-coach={`quote-${inst.ticker}`}>
        <span class="stack who">
          <span class="ticker">{inst.ticker}</span>
          <span class="tiny dim ellipsis">{inst.name}</span>
        </span>
        {spark ? <Sparkline values={[...spark, p]} up={p >= (spark[0] ?? p)} /> : <span class="spark" />}
        <span class="stack end mono">
          <span class="price">{price(p)}</span>
          <span class={`chg ${upDown(change)}`}>{signedPct(change)}</span>
        </span>
      </a>
    </li>
  );
}

/** Lines shown in the Market news list. */
const NEWS_SHOWN = 8;

function statusLine(view: MarketView): string {
  const latest = view.news[view.news.length - 1];
  if (!view.finished && latest && latest.day === view.day) return `> ${latest.text}`;
  const spy = dayChange(view.prices, view.prevCloses, view.indexInstrument);
  if (view.finished) return `> run complete. SPY ${signedPct(spy)} on the last day`;
  if (view.bar >= BARS_PER_DAY) return `> close: SPY ${signedPct(spy)}`;
  if (view.bar === 0) return '> market open';
  let up = 0;
  let down = 0;
  view.instruments.forEach((inst, i) => {
    if (inst.kind !== 'stock') return;
    const c = dayChange(view.prices, view.prevCloses, i);
    if (c > 0) up++;
    else if (c < 0) down++;
  });
  return `> SPY ${signedPct(spy)} · ${up} up / ${down} down`;
}

type ListMode = 'watchlist' | 'movers';

export function Market({ market }: { market: MarketApi }) {
  const { view, send } = market;
  const [query, setQuery] = useState('');
  const [sector, setSector] = useState<string | null>(null);
  const [mode, setMode] = useState<ListMode>('watchlist');

  const byTicker = useMemo(() => new Map(view.instruments.map((i) => [i.ticker, i])), [view.instruments]);
  const watchlist = useMemo(() => defaultWatchlist(view.instruments), [view.instruments]);
  const movers = useMemo(
    () => (mode === 'movers' ? topMovers(view.instruments, view.prices, view.prevCloses) : null),
    [mode, view.instruments, view.prices, view.prevCloses],
  );

  const rows: InstrumentInfo[] = useMemo(() => {
    if (query.trim()) return searchInstruments(view.instruments, query);
    if (sector) return view.instruments.filter((i) => inSector(i, sector)).slice(0, SECTOR_LIMIT);
    const tickers = movers ? [...movers.up, ...movers.down] : watchlist;
    return tickers.map((t) => byTicker.get(t)).filter((i): i is InstrumentInfo => !!i);
  }, [query, sector, movers, watchlist, view.instruments, byTicker]);

  // Ask the worker for sparkline data for whatever is on screen.
  const watchKey = rows.map((r) => r.ticker).join(',');
  useEffect(() => {
    send({ type: 'watch', tickers: watchKey ? watchKey.split(',') : [] });
  }, [watchKey, send]);

  const heading = query.trim() ? `Results for "${query.trim()}"` : sector ? SECTOR_CHIPS.find((c) => c.sector === sector)?.label : null;

  return (
    <>
      <RunOverCard market={market} />
      <DayCard market={market} />
      <MarginBanner market={market} />
      <div class="index-tiles">
        {INDEX_TILES.map(({ ticker, label }) => {
          const i = view.tickerIndex.get(ticker);
          if (i === undefined) return null;
          const c = dayChange(view.prices, view.prevCloses, i);
          return (
            <a key={ticker} class="tile" href={formatRoute({ name: 'stock', ticker })} aria-label={`${label} fund ${ticker}`}>
              <span class="tiny dim">{ticker}</span>
              <span class="tile-price">{price(view.prices[i] ?? 0)}</span>
              <span class={`tiny ${upDown(c)}`}>{signedPct(c)}</span>
            </a>
          );
        })}
      </div>

      <label class="search">
        <span class="accent" aria-hidden="true">
          &gt;
        </span>
        <input
          type="search"
          aria-label="Search stocks by ticker or name"
          placeholder={`search ${view.instruments.length} tickers or names`}
          value={query}
          onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
          autocomplete="off"
          autocapitalize="characters"
          spellcheck={false}
        />
      </label>

      <div class="chips" role="group" aria-label="Filter by sector">
        <button type="button" class="chip" aria-pressed={sector === null} onClick={() => setSector(null)}>
          all
        </button>
        {SECTOR_CHIPS.map((c) => (
          <button key={c.sector} type="button" class="chip" aria-pressed={sector === c.sector} onClick={() => setSector(c.sector)}>
            {c.label}
          </button>
        ))}
      </div>

      <section class="list-section">
        <div class="row baseline">
          {heading ? (
            <h2 class="title small-title">{heading}</h2>
          ) : (
            <div class="segmented tabs" role="group" aria-label="List">
              <button type="button" aria-pressed={mode === 'watchlist'} onClick={() => setMode('watchlist')}>
                Watchlist
              </button>
              <button type="button" aria-pressed={mode === 'movers'} onClick={() => setMode('movers')}>
                Top movers
              </button>
            </div>
          )}
          {(query || sector) && (
            <button
              type="button"
              class="link"
              onClick={() => {
                setQuery('');
                setSector(null);
              }}
            >
              clear
            </button>
          )}
        </div>
        {rows.length ? (
          <ul class="quotes">
            {rows.map((inst) => (
              <QuoteRow key={inst.ticker} inst={inst} view={view} />
            ))}
          </ul>
        ) : (
          <p class="small dim">No ticker or name matches that.</p>
        )}
      </section>

      <section class="list-section">
        <h2 class="section">NEWS</h2>
        <NewsList items={view.news.slice(-NEWS_SHOWN).reverse()} empty="No news yet. Earnings and headlines show up here." />
      </section>

      <p class="status-line mono">
        <span class="warn">[{barTime(view.bar)}]</span> <span>{statusLine(view)}</span>
      </p>
    </>
  );
}
