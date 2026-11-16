import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GLOSSARY, glossaryEntry, searchGlossary } from './glossary';

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? tsxFiles(p) : p.endsWith('.tsx') ? [p] : [];
  });
}

describe('glossary', () => {
  it('has about 40 unique cards with text', () => {
    expect(GLOSSARY.length).toBeGreaterThanOrEqual(40);
    expect(new Set(GLOSSARY.map((g) => g.id)).size).toBe(GLOSSARY.length);
    for (const g of GLOSSARY) {
      expect(g.short.length).toBeGreaterThan(10);
      expect(g.why.length).toBeGreaterThan(10);
      expect(`${g.short} ${g.why} ${g.example ?? ''}`).not.toMatch(/—/);
    }
  });

  it('every <Term id> used in the UI exists', () => {
    const used = new Set<string>();
    for (const file of tsxFiles(join(__dirname, '..', 'ui'))) {
      for (const m of readFileSync(file, 'utf8').matchAll(/<Term id="([^"]+)"/g)) used.add(m[1] ?? '');
      for (const m of readFileSync(file, 'utf8').matchAll(/term="([^"]+)"/g)) used.add(m[1] ?? '');
    }
    expect(used.size).toBeGreaterThan(20);
    for (const id of used) expect(glossaryEntry(id), id).toBeDefined();
  });

  it('searches terms first, then text', () => {
    expect(searchGlossary('')).toHaveLength(GLOSSARY.length);
    const r = searchGlossary('margin');
    expect(r[0]?.term.toLowerCase()).toContain('margin');
    expect(searchGlossary('zzzz')).toEqual([]);
  });
});
