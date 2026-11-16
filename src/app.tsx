import { useMemo, useState } from 'preact/hooks';
import { generateDailyCloses } from './engine/synthetic';

const W = 320;
const H = 120;

function toPoints(values: number[]): string {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return values
    .map((v, i) => `${((i / (values.length - 1)) * W).toFixed(1)},${(H - ((v - min) / span) * H).toFixed(1)}`)
    .join(' ');
}

/**
 * Phase 0 placeholder: proves the engine, fonts, tokens and offline shell work end to end.
 * Replace with the Home hub from the design canvas in phase 2.
 */
export function App() {
  const [seed, setSeed] = useState(2008);
  const closes = useMemo(
    () => generateDailyCloses({ seed, start: 100, days: 63, annualDrift: 0.08, annualVol: 0.3 }),
    [seed],
  );
  const last = closes.at(-1) ?? 100;
  const change = (last / 100 - 1) * 100;
  const up = change >= 0;

  return (
    <main style={{ maxWidth: 420, margin: '0 auto', padding: '32px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <header style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <h1 style={{ margin: 0, fontFamily: 'var(--font-pixel)', fontWeight: 400, fontSize: 28, color: 'var(--accent)' }}>DIP_LAB</h1>
        <span style={{ fontFamily: 'var(--font-data)', fontSize: 12, color: 'var(--text-dim)' }}>v0.1 · phase 0</span>
      </header>

      <section
        style={{ padding: 16, background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 'var(--radius-lg)', display: 'flex', flexDirection: 'column', gap: 12 }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-data)' }}>
          <span style={{ color: 'var(--text-dim)', fontSize: 13 }}>seed={seed} · 63 days</span>
          <span style={{ fontWeight: 700, color: up ? 'var(--accent)' : 'var(--down)' }}>
            {up ? '+' : '−'}
            {Math.abs(change).toFixed(1)}%
          </span>
        </div>
        <svg role="img" aria-label={`Simulated price path, ${up ? 'up' : 'down'} ${Math.abs(change).toFixed(1)} percent`} viewBox={`0 0 ${W} ${H}`} width="100%">
          <polyline points={toPoints(closes)} fill="none" stroke={up ? 'var(--accent)' : 'var(--down)'} stroke-width="2" stroke-linejoin="round" />
        </svg>
        <button
          type="button"
          onClick={() => setSeed((s) => s + 1)}
          style={{ height: 44, border: 0, borderRadius: 'var(--radius-md)', background: 'var(--accent)', color: 'var(--on-accent)', font: 'inherit', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}
        >
          New market (seed +1)
        </button>
      </section>

      <p style={{ margin: 0, fontSize: 13, lineHeight: '19px', color: 'var(--text-dim)' }}>
        Simulated prices. Works offline once installed. The full game is built phase by phase; see docs/SPEC.md.
      </p>
    </main>
  );
}
