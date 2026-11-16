import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The engine must stay pure and reproducible: no clocks, no ambient randomness,
// no DOM or UI framework, no network. All randomness goes through rng.ts.
const FORBIDDEN: [RegExp, string][] = [
  [/\bDate\.now\s*\(/, 'Date.now()'],
  [/\bnew Date\s*\(/, 'new Date()'],
  [/\bMath\.random\s*\(/, 'Math.random()'],
  [/\bperformance\.now\s*\(/, 'performance.now()'],
  [/\bcrypto\.(getRandomValues|randomUUID)\b/, 'crypto randomness'],
  [/\b(document|window|navigator|localStorage|sessionStorage|indexedDB)\./, 'browser globals'],
  [/\b(fetch|XMLHttpRequest|WebSocket)\s*\(/, 'network calls'],
  [/from\s+['"](preact|preact\/[^'"]*)['"]/, 'Preact imports'],
  [/from\s+['"]\.\.\/(ui|worker)\//, 'UI or worker imports'],
];

const dir = join(import.meta.dirname, '.');
const files = readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));

/** Drops comments so documentation can name the forbidden APIs. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

describe('engine purity', () => {
  it('finds the engine sources', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it.each(files)('%s uses no clocks, ambient randomness, DOM or network', (file) => {
    const source = code(readFileSync(join(dir, file), 'utf8'));
    const hits = FORBIDDEN.filter(([re]) => re.test(source)).map(([, what]) => what);
    expect(hits).toEqual([]);
  });
});
