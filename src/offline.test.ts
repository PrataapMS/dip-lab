import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// Dip Lab must work with zero network after the first load: no code may fetch anything at
// runtime. (The service worker's own update check is the one exception and lives in
// public/sw-update.js and the registration, outside these patterns.)
const FORBIDDEN: [RegExp, string][] = [
  [/\bfetch\s*\(/, 'fetch()'],
  [/\bXMLHttpRequest\b/, 'XMLHttpRequest'],
  [/\bnew\s+WebSocket\b/, 'WebSocket'],
  [/\bnew\s+EventSource\b/, 'EventSource'],
  [/\bsendBeacon\b/, 'sendBeacon'],
  [/\bimportScripts\s*\(/, 'importScripts()'],
  [/\bimport\s*\(\s*['"`]https?:/, 'remote import()'],
  [/['"`]https?:\/\/(?!www\.w3\.org\/)/, 'an http(s) URL'],
  [/fonts\.googleapis|fonts\.gstatic/, 'Google Fonts'],
];

const root = join(import.meta.dirname, '.');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx|css)$/.test(name) && !/\.test\.ts$/.test(name) ? [path] : [];
  });
}

/** Drops comments so documentation can name the forbidden APIs. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

const files = sources(root).map((p) => relative(root, p));

describe('offline: no network calls in the app', () => {
  it('finds the sources', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it.each(files)('%s makes no network calls', (file) => {
    const source = code(readFileSync(join(root, file), 'utf8'));
    expect(FORBIDDEN.filter(([re]) => re.test(source)).map(([, what]) => what)).toEqual([]);
  });

  it('fonts come from @fontsource, bundled with the app', () => {
    const main = readFileSync(join(root, 'main.tsx'), 'utf8');
    expect(main).toMatch(/@fontsource\//);
  });
});
