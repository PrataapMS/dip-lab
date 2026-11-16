interface Props {
  values: readonly number[];
  /** Total points the line will have when complete, so a partial day fills left to right. */
  capacity?: number;
  /** Draw a dashed reference line at this value (e.g. the previous close). */
  baseline?: number;
  up: boolean;
  label: string;
  height?: number;
}

const W = 320;

export function LineChart({ values, capacity, baseline, up, label, height = 120 }: Props) {
  const H = height;
  const slots = Math.max(capacity ?? values.length, 2) - 1;
  const all = baseline !== undefined ? [...values, baseline] : values;
  const min = Math.min(...all);
  const max = Math.max(...all);
  const span = max - min || 1;
  const y = (v: number) => (H - 4 - ((v - min) / span) * (H - 8)).toFixed(1);
  const points = values.map((v, i) => `${((i / slots) * W).toFixed(1)},${y(v)}`).join(' ');
  const last = values[values.length - 1];
  const color = up ? 'var(--accent)' : 'var(--down)';

  return (
    <svg class="chart" role="img" aria-label={label} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height={H}>
      {baseline !== undefined && (
        <line x1="0" x2={W} y1={y(baseline)} y2={y(baseline)} stroke="var(--line)" stroke-dasharray="4 4" />
      )}
      {values.length > 1 && (
        <polyline points={points} fill="none" stroke={color} stroke-width="2" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
      )}
      {last !== undefined && (
        <circle cx={(((values.length - 1) / slots) * W).toFixed(1)} cy={y(last)} r="3" fill={color} />
      )}
    </svg>
  );
}
