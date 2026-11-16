const W = 64;
const H = 24;

/** Tiny trend line. Decorative: the row next to it carries the numbers. */
export function Sparkline({ values, up }: { values: readonly number[]; up: boolean }) {
  if (values.length < 2) return <svg class="spark" aria-hidden="true" viewBox={`0 0 ${W} ${H}`} />;
  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  const step = W / (values.length - 1);
  const points = values
    .map((v, i) => `${(i * step).toFixed(1)},${(H - 2 - ((v - min) / span) * (H - 4)).toFixed(1)}`)
    .join(' ');
  return (
    <svg class="spark" aria-hidden="true" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <polyline
        points={points}
        fill="none"
        stroke={up ? 'var(--accent)' : 'var(--down)'}
        stroke-width="1.6"
        stroke-linejoin="round"
        stroke-linecap="round"
        vector-effect="non-scaling-stroke"
      />
    </svg>
  );
}
