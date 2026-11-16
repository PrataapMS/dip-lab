export interface Anchor {
  /** Point index, 0..n. */
  at: number;
  /** Value the path must pass through at that index. */
  value: number;
}

/**
 * Turn random steps into a path that passes exactly through the anchors (a Brownian bridge
 * between each pair). Between anchors the path follows a straight line in step-index time
 * plus a random walk, with the walk's end value removed in proportion to its variance so far.
 *
 * `shocks[k]` is the random step from point k to k+1 and `variances[k]` its variance.
 * Anchors must be sorted, start at 0 and end at shocks.length. Returns shocks.length + 1 points.
 *
 * `reversionDays` (optional) pulls the walk back toward the line with that time scale, so
 * long stretches between anchors keep realistic daily moves without wandering far off shape.
 */
export function bridgeThrough(
  shocks: readonly number[] | Float64Array,
  variances: readonly number[] | Float64Array,
  anchors: readonly Anchor[],
  reversionDays?: number,
): Float64Array {
  const n = shocks.length;
  const first = anchors[0];
  const last = anchors[anchors.length - 1];
  if (!first || !last || first.at !== 0 || last.at !== n) {
    throw new Error('bridgeThrough: anchors must start at 0 and end at the last point');
  }
  const keep = reversionDays && reversionDays > 0 ? 1 - 1 / reversionDays : 1;
  const out = new Float64Array(n + 1);
  for (let s = 0; s + 1 < anchors.length; s++) {
    const a = anchors[s];
    const b = anchors[s + 1];
    if (!a || !b || b.at <= a.at) throw new Error('bridgeThrough: anchors must be strictly increasing');
    const span = b.at - a.at;
    // Walk and cumulative variance local to this stretch, both starting at 0.
    const walk = new Float64Array(span + 1);
    const cumVar = new Float64Array(span + 1);
    for (let j = 0; j < span; j++) {
      walk[j + 1] = keep * (walk[j] ?? 0) + (shocks[a.at + j] ?? 0);
      cumVar[j + 1] = (cumVar[j] ?? 0) + (variances[a.at + j] ?? 0);
    }
    const varSpan = cumVar[span] ?? 0;
    const walkEnd = walk[span] ?? 0;
    for (let j = 0; j <= span; j++) {
      const lin = a.value + (j / span) * (b.value - a.value);
      const frac = varSpan > 0 ? (cumVar[j] ?? 0) / varSpan : j / span;
      out[a.at + j] = lin + (walk[j] ?? 0) - frac * walkEnd;
    }
  }
  return out;
}
