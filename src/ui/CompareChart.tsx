interface Props {
  /** The player's curve and SPY's, both rebased to 100 at the start, same length. */
  you: readonly number[];
  spy: readonly number[];
  /** Points the run will have when finished, so the lines fill left to right. */
  capacity: number;
  label: string;
  height?: number;
  /** Points to circle on the account line, e.g. flagged moments. */
  markers?: readonly { index: number; color: string }[];
}

const W = 320;
/** More points than this are thinned: the chart is only ~320 units wide. */
const MAX_POINTS = 400;

/**
 * Indexes to draw from a long series: the first and last, plus each bucket's lowest and highest
 * point in order, so dips and peaks survive however long the run is.
 */
export function thinned(vals: readonly number[], max = MAX_POINTS): number[] {
  const n = vals.length;
  if (n <= max) return Array.from({ length: n }, (_, i) => i);
  const buckets = Math.floor((max - 2) / 2);
  const size = (n - 2) / buckets;
  const out = [0];
  for (let b = 0; b < buckets; b++) {
    const from = 1 + Math.floor(b * size);
    const to = Math.min(n - 1, 1 + Math.floor((b + 1) * size));
    let lo = from;
    let hi = from;
    for (let i = from; i < to; i++) {
      if ((vals[i] ?? 0) < (vals[lo] ?? 0)) lo = i;
      if ((vals[i] ?? 0) > (vals[hi] ?? 0)) hi = i;
    }
    if (to > from) out.push(...(lo === hi ? [lo] : lo < hi ? [lo, hi] : [hi, lo]));
  }
  out.push(n - 1);
  return out;
}

/** Two lines rebased to 100: the account (solid accent) against SPY (dashed, dim). */
export function CompareChart({ you, spy, capacity, label, height = 140, markers = [] }: Props) {
  const H = height;
  const slots = Math.max(capacity, 2) - 1;
  let min = 100;
  let max = 100;
  for (const v of you) (min = Math.min(min, v)), (max = Math.max(max, v));
  for (const v of spy) (min = Math.min(min, v)), (max = Math.max(max, v));
  const span = max - min || 1;
  const x = (i: number) => ((i / slots) * W).toFixed(1);
  const y = (v: number) => (H - 6 - ((v - min) / span) * (H - 12)).toFixed(1);
  const line = (vals: readonly number[]) =>
    thinned(vals)
      .map((i) => `${x(i)},${y(vals[i] ?? 100)}`)
      .join(' ');
  const last = you[you.length - 1];
  return (
    <svg
      class="chart"
      role="img"
      aria-label={label}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      width="100%"
      height={H}
    >
      <line x1="0" x2={W} y1={y(100)} y2={y(100)} stroke="var(--line)" stroke-dasharray="2 4" />
      {spy.length > 1 && (
        <polyline
          points={line(spy)}
          fill="none"
          stroke="var(--text-dim)"
          stroke-width="1.5"
          stroke-dasharray="5 4"
          vector-effect="non-scaling-stroke"
        />
      )}
      {you.length > 1 && (
        <polyline
          points={line(you)}
          fill="none"
          stroke="var(--accent)"
          stroke-width="2.5"
          stroke-linejoin="round"
          vector-effect="non-scaling-stroke"
        />
      )}
      {last !== undefined && (
        <circle cx={x(you.length - 1)} cy={y(last)} r="3" fill="var(--accent)" />
      )}
      {markers
        .filter((m) => m.index >= 0 && m.index < you.length)
        .map((m) => (
          <circle
            key={m.index}
            cx={x(m.index)}
            cy={y(you[m.index] ?? 100)}
            r="5"
            fill="var(--bg)"
            stroke={m.color}
            stroke-width="2.5"
          />
        ))}
    </svg>
  );
}

/** Rebase the account and SPY so both start at 100, aligned day by day plus "now". */
export function rebased(
  startingCash: number,
  equityByDay: readonly number[],
  valueNow: number,
  indexHistory: readonly number[],
  indexNow: number,
  day: number,
): { you: number[]; spy: number[] } {
  const youRaw = [startingCash, ...equityByDay.slice(0, day), valueNow];
  const spyRaw = [...indexHistory.slice(0, day + 1), indexNow];
  const s0 = spyRaw[0] || 1;
  return {
    you: youRaw.map((v) => (v / startingCash) * 100),
    spy: spyRaw.map((v) => (v / s0) * 100),
  };
}
