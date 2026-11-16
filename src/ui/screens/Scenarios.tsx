import { useState } from 'preact/hooks';
import { DEFAULT_ACCOUNT_SETTINGS } from '../../engine/account';
import { DEFAULT_SPEED, type Speed, SPEEDS } from '../../engine/clock';
import type { Regime } from '../../engine/regimes';
import { CUSTOM_LIMITS, type NewsLevel, SCENARIOS, type ScenarioDef } from '../../engine/scenarios';
import { dateRange, money } from '../format';
import { BackIcon, PlayIcon } from '../icons';
import { navigate } from '../router';
import type { Market, RunConfig } from '../useMarket';

const CUSTOM = 'custom';
const DEFAULT_SCENARIO = 'first-steps';

export function newSeed(): number {
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

/** One-tap choice from a short list. */
function Choice<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div class="field">
      <span class="field-label">{label}</span>
      <div class="chips quick wrap" role="group" aria-label={label}>
        {options.map((o) => (
          <button key={String(o.value)} type="button" class="chip" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const CASH = [1_000, 10_000, 100_000, 1_000_000].map((v) => ({ value: v, label: money(v) }));
const FEES = [0, 1, 5].map((v) => ({ value: v, label: v === 0 ? '$0' : `$${v} a trade` }));
const SHORTS: { value: 'off' | 'on'; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'on', label: 'On' },
];
const MARGIN: { value: 'off' | '2x'; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: '2x', label: '2x' },
];
const SPEED_OPTIONS = (Object.keys(SPEEDS) as Speed[]).map((s) => ({ value: s, label: `${s} · ${SPEEDS[s] / 1000}s/day` }));
const LENGTHS = [
  { value: 21, label: '1 month' },
  { value: 63, label: '3 months' },
  { value: 252, label: '1 year' },
  { value: 756, label: '3 years' },
];
const MOODS: { value: Regime; label: string }[] = [
  { value: 'calm', label: 'calm' },
  { value: 'bull', label: 'bull' },
  { value: 'bear', label: 'bear' },
  { value: 'crash', label: 'crash' },
];
const VOLS = [
  { value: 0.7, label: 'low' },
  { value: 1, label: 'normal' },
  { value: 1.4, label: 'high' },
];
const NEWS: { value: NewsLevel; label: string }[] = [
  { value: 'off', label: 'off' },
  { value: 'normal', label: 'normal' },
  { value: 'busy', label: 'busy' },
];
const TARGETS = [
  { value: 0, label: 'none' },
  { value: 0.1, label: '+10%' },
  { value: 0.25, label: '+25%' },
  { value: 0.5, label: '+50%' },
];

function ScenarioCard({ def, selected, inProgress, onPick }: { def: ScenarioDef; selected: boolean; inProgress: boolean; onPick: () => void }) {
  const boss = def.difficulty >= 4;
  return (
    <button type="button" class={`scenario-card ${boss ? 'boss' : ''}`} aria-pressed={selected} onClick={onPick}>
      <span class="row">
        <span class="scenario-name">{def.name}</span>
        {inProgress ? <span class="pill">in progress</span> : boss ? <span class="badge boss">BOSS RUN</span> : null}
      </span>
      <span class="small dim">
        {def.fictional ? 'Made-up market' : dateRange(def.start, def.end)} · {def.teaches}
      </span>
      <span class="row mono tiny dim">
        <span class="pips-row">
          difficulty <Pips level={def.difficulty} boss={boss} />
        </span>
      </span>
    </button>
  );
}

export function Scenarios({ market }: { market: Market }) {
  const { view, send, startRun } = market;
  const [picked, setPicked] = useState(DEFAULT_SCENARIO);
  const [tweak, setTweak] = useState(false);
  const [cash, setCash] = useState(DEFAULT_ACCOUNT_SETTINGS.startingCash);
  const [fee, setFee] = useState(DEFAULT_ACCOUNT_SETTINGS.commission);
  const [margin, setMargin] = useState<'off' | '2x'>('off');
  const [shorts, setShorts] = useState<'off' | 'on'>('off');
  const [speed, setSpeed] = useState<Speed>(DEFAULT_SPEED);
  const [start, setStart] = useState('2015-01-02');
  const [days, setDays] = useState(63);
  const [mood, setMood] = useState<Regime>('calm');
  const [vol, setVol] = useState(1);
  const [news, setNews] = useState<NewsLevel>('normal');
  const [target, setTarget] = useState(0);
  const [seed, setSeed] = useState(newSeed);

  const custom = picked === CUSTOM;
  const def = SCENARIOS.find((s) => s.id === picked);
  const boss = (def?.difficulty ?? 0) >= 4;
  const running = view.ready && !view.finished ? view.scenario : null;
  const startOk = start >= CUSTOM_LIMITS.from && start <= CUSTOM_LIMITS.to;
  const seedOk = Number.isInteger(seed) && seed >= 0 && seed < 1_000_000;

  const go = () => {
    const name = custom ? 'a Custom run' : def?.name;
    if (running && !confirm(`Leave ${running.name} and start ${name}?`)) return;
    const config: RunConfig = {
      scenarioId: picked,
      seed: custom ? seed : newSeed(),
      settings: {
        ...DEFAULT_ACCOUNT_SETTINGS,
        startingCash: cash,
        commission: fee,
        ...(margin === '2x' ? { margin: true } : {}),
        ...(margin === '2x' && shorts === 'on' ? { shorts: true } : {}),
      },
      ...(custom ? { custom: { start, days, startRegime: mood, volScale: vol, news }, targetReturn: target || undefined } : {}),
    };
    send({ type: 'speed', dayLengthMs: SPEEDS[speed] });
    startRun(config);
    navigate({ name: 'market' });
  };

  return (
    <>
      <header class="stack gap-8">
        <div class="row">
          <a class="icon-button" href="#/home" aria-label="Back to home">
            <BackIcon />
          </a>
          <span class="mono tiny dim">new_run</span>
        </div>
        <h1 class="picker-title">Pick your run</h1>
        <p class="small dim">Same seed, same market, every replay. Prices are simulated.</p>
      </header>

      <div class="stack gap-8" role="group" aria-label="Scenarios">
        {SCENARIOS.map((s) => (
          <ScenarioCard key={s.id} def={s} selected={picked === s.id} inProgress={running?.id === s.id} onPick={() => setPicked(s.id)} />
        ))}
        <button type="button" class={`scenario-card custom`} aria-pressed={custom} onClick={() => setPicked(CUSTOM)}>
          <span class="scenario-name">Custom</span>
          <span class="small dim">Any start date, length and mood · free exploration</span>
        </button>
      </div>

      {custom && (
        <section class="panel stack gap-8" aria-labelledby="custom-title">
          <h2 id="custom-title" class="section">CUSTOM MARKET</h2>
          <label class="field">
            <span class="field-label">Start date</span>
            <input
              type="date"
              min={CUSTOM_LIMITS.from}
              max={CUSTOM_LIMITS.to}
              value={start}
              onInput={(e) => setStart((e.target as HTMLInputElement).value)}
            />
            {!startOk && <span class="tiny down">Pick a date from 1998 to 2024.</span>}
          </label>
          <Choice label="Length" value={days} options={LENGTHS} onChange={setDays} />
          <Choice label="Starting mood" value={mood} options={MOODS} onChange={setMood} />
          <Choice label="Volatility" value={vol} options={VOLS} onChange={setVol} />
          <Choice label="Company news and earnings" value={news} options={NEWS} onChange={setNews} />
          <Choice label="End early at a target return" value={target} options={TARGETS} onChange={setTarget} />
          <label class="field">
            <span class="field-label">Seed</span>
            <span class="row gap-8">
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={999_999}
                value={seed}
                onInput={(e) => setSeed(Number((e.target as HTMLInputElement).value))}
              />
              <button type="button" class="ghost" onClick={() => setSeed(newSeed())}>
                random
              </button>
            </span>
            <span class="tiny dim">The same seed and options always build the same market, so you can share one.</span>
          </label>
        </section>
      )}

      {tweak && (
        <section class="panel stack gap-8" aria-labelledby="rules-title">
          <h2 id="rules-title" class="section">RULES AND SPEED</h2>
          <Choice label="Starting cash" value={cash} options={CASH} onChange={setCash} />
          <Choice label="Commission" value={fee} options={FEES} onChange={setFee} />
          <Choice label="Margin (borrow up to 2x, 8% a year)" value={margin} options={MARGIN} onChange={setMargin} />
          {margin === '2x' && <Choice label="Short selling" value={shorts} options={SHORTS} onChange={setShorts} />}
          <Choice label="Speed" value={speed} options={SPEED_OPTIONS} onChange={setSpeed} />
        </section>
      )}

      <div class="picker-footer">
        <span class="mono tiny dim">
          cash={money(cash)} speed={SPEEDS[speed] / 1000}s/day margin={margin}{margin === '2x' && shorts === 'on' ? ' shorts=on' : ''} fees=${fee}
        </span>
        <button type="button" class={`primary ${boss ? 'boss' : ''}`} onClick={go} disabled={custom && (!startOk || !seedOk)}>
          <PlayIcon /> {custom ? 'Start custom run' : boss ? 'Start boss run' : `Start ${def?.name ?? 'run'}`}
        </button>
        {!tweak && (
          <button type="button" class="ghost" onClick={() => setTweak(true)}>
            Tweak rules and speed
          </button>
        )}
      </div>
    </>
  );
}
