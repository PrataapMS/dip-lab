/**
 * Seeded random numbers. Every market in Dip Lab is driven from one seed, so a run
 * can be replayed exactly: same seed, same prices, same news.
 */
export type Rng = () => number;

/** mulberry32: small, fast, good enough for a game. Returns floats in [0, 1). */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal draw (mean 0, sd 1) via Box-Muller. */
export function normal(rand: Rng): number {
  let u = 0;
  while (u === 0) u = rand();
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Derive an independent child seed, e.g. one stream per stock from the run seed. */
export function childSeed(seed: number, key: string): number {
  let h = 2166136261 ^ (seed >>> 0);
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
