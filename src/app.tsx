import { useEffect, useMemo, useState } from 'preact/hooks';
import { type Speed, SPEEDS as SPEED_MS, speedOf } from './engine/clock';
import { barTime, POINTS_PER_DAY } from './engine/intraday';
import { SCENARIOS } from './engine/scenarios';
import { longDate, price, signedPct, upDown } from './ui/format';
import { LineChart } from './ui/LineChart';
import { useMarket } from './ui/useMarket';

const SPEEDS: { key: Speed; label: string }[] = (Object.keys(SPEED_MS) as Speed[]).map((key) => ({ key, label: key }));

function newSeed(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return (buf[0] ?? 1) % 1_000_000;
}

/**
 * Phase 1 screen: a live, ticking market from the engine worker. Replaced by the Home hub
 * and Market HUD in phase 2.
 */
export function App() {
  const [scenarioId, setScenarioId] = useState('covid-2020');
  const [seed, setSeed] = useState(2008);
  const { view, send, startRun } = useMarket();
  useEffect(() => startRun(scenarioId, seed), [scenarioId, seed, startRun]);

  const idx = view.indexInstrument;
  const now = view.prices[idx] ?? 0;
  const prev = view.prevCloses[idx] ?? now;
  const first = view.indexHistory[0] ?? now;
  const runChange = first ? now / first - 1 : 0;
  const dayChange = prev ? now / prev - 1 : 0;
  const history = useMemo(() => [...view.indexHistory, now], [view.indexHistory, now]);

  const movers = useMemo(() => {
    const rows = view.instruments
      .map((inst, i) => {
        const p = view.prices[i] ?? 0;
        const pc = view.prevCloses[i] ?? 0;
        return { ...inst, price: p, change: pc ? p / pc - 1 : 0 };
      })
      .filter((r) => r.kind === 'stock' && r.price > 0);
    rows.sort((a, b) => b.change - a.change);
    return { up: rows.slice(0, 4), down: rows.slice(-4).reverse() };
  }, [view.instruments, view.prices, view.prevCloses]);

  const date = view.dates[view.day] ?? '';
  const speedKey = speedOf(view.dayLengthMs);

  return (
    <main class="screen">
      <header class="top">
        <h1 class="logo">DIP_LAB</h1>
        <span class="dim mono">v0.1 · phase 1</span>
      </header>

      <section class="panel controls">
        <label class="field">
          <span class="label">Scenario</span>
          <select value={scenarioId} onChange={(e) => setScenarioId((e.target as HTMLSelectElement).value)}>
            {SCENARIOS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <button type="button" class="ghost" onClick={() => setSeed(newSeed())}>
          New market
        </button>
      </section>

      <section class="panel">
        {!view.ready ? (
          <p class="dim mono">&gt; building market…</p>
        ) : (
          <>
            <div class="row mono dim small">
              <span>
                {longDate(date)} · {barTime(view.bar)} ET
              </span>
              <span>
                day {view.day + 1}/{view.dates.length}
              </span>
            </div>
            <div class="quote">
              <span class="ticker">SPY</span>
              <span class="mono big">{price(now)}</span>
              <span class={`mono ${upDown(dayChange)}`}>{signedPct(dayChange)} today</span>
            </div>
            <p class="small dim">{view.scenario?.teaches}</p>

            <h2 class="section">Today</h2>
            <LineChart
              values={view.indexToday}
              capacity={POINTS_PER_DAY}
              baseline={prev}
              up={dayChange >= 0}
              label={`SPY today, ${signedPct(dayChange)}`}
              height={90}
            />

            <h2 class="section">
              Run so far <span class={`mono ${upDown(runChange)}`}>{signedPct(runChange)}</span>
            </h2>
            <LineChart
              values={history}
              capacity={view.dates.length + 1}
              baseline={first}
              up={runChange >= 0}
              label={`SPY since the start, ${signedPct(runChange)}`}
            />

            <div class="buttons">
              <button
                type="button"
                class="primary"
                disabled={view.finished}
                onClick={() => send({ type: view.playing ? 'pause' : 'play' })}
              >
                {view.finished ? 'Run complete' : view.playing ? 'Pause' : 'Play'}
              </button>
              <button type="button" class="ghost" disabled={view.finished} onClick={() => send({ type: 'stepDay' })}>
                Skip to close
              </button>
            </div>
            <div class="speeds" role="group" aria-label="Day length">
              {SPEEDS.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  class={`chip ${speedKey === s.key ? 'on' : ''}`}
                  aria-pressed={speedKey === s.key}
                  onClick={() => send({ type: 'speed', dayLengthMs: SPEED_MS[s.key] })}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <p class="small dim">1 trading day = {(view.dayLengthMs / 1000).toFixed(0)} s</p>
          </>
        )}
        {view.error && <p class="down mono small">&gt; error: {view.error}</p>}
      </section>

      {view.ready && (
        <section class="panel">
          <h2 class="section">Top movers today</h2>
          <ul class="movers">
            {[...movers.up, ...movers.down].map((m) => (
              <li key={m.ticker}>
                <span class="ticker">{m.ticker}</span>
                <span class="name dim">{m.name}</span>
                <span class="mono">{price(m.price)}</span>
                <span class={`mono ${upDown(m.change)}`}>{signedPct(m.change)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p class="small dim">
        Prices are simulated{view.scenario && !view.scenario.fictional ? ', shaped on the real period' : ''}. Not
        investment advice. Seed {seed}.
      </p>
    </main>
  );
}
