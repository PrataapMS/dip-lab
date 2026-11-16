export interface Anchor {
  /** Point index, 0..n. */
  at: number;
  /** Value the path must pass through at that index. */
  value: number;
}

/**
 * Turn random steps into a path that passes exactly through the anchors (a Brownian bridge
 * between each pair). Between anchors the path follows a straight line in step-index time
 * plus the random walk, with the walk's drift removed in proportion to its variance so far.
 *
 * `shocks[k]` is the random step from point k to k+1 and `variances[k]` its variance.
 * Anchors must be sorted, start at 0 and end at shocks.length. Returns shocks.length + 1 points.
 */
export function bridgeThrough(
  shocks: readonly number[] | Float64Array,
  variances: readonly number[] | Float64Array,
  anchors: readonly Anchor[],
): Float64Array {
  const n = shocks.length;
  const first = anchors[0];
  const last = anchors[anchors.length - 1];
  if (!first || !last || first.at !== 0 || last.at !== n) {
    throw new Error('bridgeThrough: anchors must start at 0 and end at the last point');
  }
  const walk = new Float64Array(n + 1);
  const cumVar = new Float64Array(n + 1);
  for (let k = 0; k < n; k++) {
    walk[k + 1] = (walk[k] ?? 0) + (shocks[k] ?? 0);
    cumVar[k + 1] = (cumVar[k] ?? 0) + (variances[k] ?? 0);
  }
  const out = new Float64Array(n + 1);
  for (let s = 0; s + 1 < anchors.length; s++) {
    const a = anchors[s];
    const b = anchors[s + 1];
    if (!a || !b || b.at <= a.at) throw new Error('bridgeThrough: anchors must be strictly increasing');
    const span = b.at - a.at;
    const varSpan = (cumVar[b.at] ?? 0) - (cumVar[a.at] ?? 0);
    const walkSpan = (walk[b.at] ?? 0) - (walk[a.at] ?? 0);
    for (let i = a.at; i <= b.at; i++) {
      const lin = a.value + ((i - a.at) / span) * (b.value - a.value);
      const frac = varSpan > 0 ? ((cumVar[i] ?? 0) - (cumVar[a.at] ?? 0)) / varSpan : (i - a.at) / span;
      out[i] = lin + (walk[i] ?? 0) - (walk[a.at] ?? 0) - frac * walkSpan;
    }
  }
  return out;
}
