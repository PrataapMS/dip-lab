interface Props {
  /** The player's curve and SPY's, both rebased to 100 at the start, same length. */
  you: readonly number[];
  spy: readonly number[];
  /** Points the run will have when finished, so the lines fill left to right. */
  capacity: number;
  label: string;
  height?: number;
}

const W = 320;

/** Two lines rebased to 100: the account (solid accent) against SPY (dashed, dim). */
export function CompareChart({ you, spy, capacity, label, height = 140 }: Props) {
  const H = height;
  const slots = Math.max(capacity, 2) - 1;
  const all = [...you, ...spy, 100];
  const min = Math.min(...all);
  const max = Math.max(...all);
  const span = max - min || 1;
  const x = (i: number) => ((i / slots) * W).toFixed(1);
  const y = (v: number) => (H - 6 - ((v - min) / span) * (H - 12)).toFixed(1);
  const line = (vals: readonly number[]) => vals.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  const last = you[you.length - 1];
  return (
    <svg class="chart" role="img" aria-label={label} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height={H}>
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
      {last !== undefined && <circle cx={x(you.length - 1)} cy={y(last)} r="3" fill="var(--accent)" />}
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
