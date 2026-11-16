import { describe, expect, it } from 'vitest';
import { tradingDaysBetween } from './calendar';
import {
  buildScenarioMarket,
  buildSpecialPath,
  customScenario,
  getScenario,
  regimeForSlope,
  SCENARIOS,
  type ScenarioDef,
} from './scenarios';

const SEEDS = [1, 2, 3, 4, 5];

/** Market level path (starts at 1) from daily log returns. */
function levels(returns: readonly number[]): number[] {
  const out = [1];
  let log = 0;
  for (const r of returns) {
    log += r;
    out.push(Math.exp(log));
  }
  return out;
}

function maxDrawdown(path: readonly number[]): { depth: number; peakAt: number; troughAt: number } {
  let peak = path[0] ?? 1;
  let peakAt = 0;
  let best = { depth: 0, peakAt: 0, troughAt: 0 };
  path.forEach((p, i) => {
    if (p > peak) {
      peak = p;
      peakAt = i;
    }
    const dd = 1 - p / peak;
    if (dd > best.depth) best = { depth: dd, peakAt, troughAt: i };
  });
  return best;
}

/** Drawdown implied by the waypoints alone. */
function waypointDrawdown(def: ScenarioDef): number {
  return maxDrawdown([1, ...def.market.map((p) => 1 + p.ret)]).depth;
}

describe('scenarios', () => {
  it('has unique ids and valid waypoints for every scenario', () => {
    expect(new Set(SCENARIOS.map((s) => s.id)).size).toBe(SCENARIOS.length);
    for (const s of SCENARIOS) expect(() => buildScenarioMarket(s, 1)).not.toThrow();
  });

  it('is deterministic for a seed, and seeds differ', () => {
    const def = getScenario('covid-2020');
    expect(buildScenarioMarket(def, 9)).toEqual(buildScenarioMarket(def, 9));
    expect(buildScenarioMarket(def, 9).returns).not.toEqual(buildScenarioMarket(def, 10).returns);
  });

  it('passes through every market waypoint for any seed', () => {
    for (const def of SCENARIOS) {
      for (const seed of SEEDS) {
        const m = buildScenarioMarket(def, seed);
        const path = levels(m.returns);
        for (const p of def.market) {
          const at = m.dates.filter((d) => d <= p.date).length;
          expect(path[at]).toBeCloseTo(1 + p.ret, 9);
        }
      }
    }
  });

  it('keeps each historical crash within tolerance of its target shape', () => {
    for (const def of SCENARIOS.filter((s) => !s.fictional)) {
      const target = waypointDrawdown(def);
      for (const seed of SEEDS) {
        const dd = maxDrawdown(levels(buildScenarioMarket(def, seed).returns)).depth;
        expect(dd).toBeGreaterThanOrEqual(target - 1e-9);
        expect(dd).toBeLessThan(target + 0.1);
      }
    }
  });

  it('2008: about -57% over about 17 months', () => {
    const def = getScenario('gfc-2008');
    const m = buildScenarioMarket(def, 1);
    expect(m.dates.length).toBeGreaterThan(330);
    expect(m.dates.length).toBeLessThan(380);
    const path = levels(m.returns);
    expect(path.at(-1)).toBeCloseTo(0.43, 6);
  });

  it('COVID: -34% in 23 trading days, then a V-shaped recovery', () => {
    const m = buildScenarioMarket(getScenario('covid-2020'), 3);
    const path = levels(m.returns);
    expect(path[23]).toBeCloseTo(0.66, 6);
    expect(m.regimes.slice(0, 23).every((r) => r === 'crash')).toBe(true);
    expect(path.at(-1)).toBeCloseTo(1.11, 6);
  });

  it('dot-com: tech falls about 78% from its peak', () => {
    const m = buildScenarioMarket(getScenario('dot-com'), 2);
    const market = levels(m.returns);
    // Typical tech stock: beta 1.2 to the market plus the tech sector factor.
    const techLog = m.returns.map((r, i) => 1.2 * r + (m.sectors['Information Technology'][i] ?? 0));
    const tech = levels(techLog);
    expect(maxDrawdown(tech).depth).toBeGreaterThan(0.72);
    expect(maxDrawdown(tech).depth).toBeLessThan(0.88);
    expect(maxDrawdown(market).depth).toBeLessThan(maxDrawdown(tech).depth);
  });

  it('picks moods from how steep each stretch is', () => {
    expect(regimeForSlope(-3)).toBe('crash');
    expect(regimeForSlope(-0.3)).toBe('bear');
    expect(regimeForSlope(0.05)).toBe('calm');
    expect(regimeForSlope(0.4)).toBe('bull');
    const m = buildScenarioMarket(getScenario('gfc-2008'), 1);
    expect(m.regimes).toContain('bear');
  });

  it('builds a free-running custom market of the requested length', () => {
    const def = customScenario({ start: '2026-01-02', days: 100 });
    const m = buildScenarioMarket(def, 4);
    expect(m.dates).toHaveLength(100);
    expect(m.returns).toHaveLength(100);
    expect(buildScenarioMarket(def, 4)).toEqual(m);
  });

  it('drives the meme stock through its waypoints', () => {
    const def = getScenario('meme-squeeze');
    const special = def.special?.[0];
    if (!special) throw new Error('missing special stock');
    const dates = tradingDaysBetween(def.start, def.end);
    const closes = buildSpecialPath(special, dates, 1);
    expect(closes[0]).toBe(special.startPrice);
    const peak = Math.max(...closes);
    expect(peak).toBeGreaterThanOrEqual(special.startPrice * 14 - 1e-6);
    expect(closes.at(-1)).toBeCloseTo(special.startPrice * 2.5, 6);
  });
});
