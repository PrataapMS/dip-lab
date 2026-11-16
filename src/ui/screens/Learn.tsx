import { useState } from 'preact/hooks';
import { type GlossaryEntry, GLOSSARY, searchGlossary } from '../../learn/glossary';
import { TermSheet } from '../Term';
import { useProgress } from '../useProgress';

function Glossary() {
  const { progress, record } = useProgress();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<GlossaryEntry | null>(null);
  const list = searchGlossary(query);
  const seen = new Set(progress.glossarySeen);
  return (
    <section class="stack gap-8" aria-labelledby="glossary-title">
      <div class="row baseline">
        <h2 id="glossary-title" class="title small-title">
          Glossary
        </h2>
        <span class="mono tiny dim">
          {GLOSSARY.filter((g) => seen.has(g.id)).length}/{GLOSSARY.length} read
        </span>
      </div>
      <label class="search">
        <span class="accent mono" aria-hidden="true">
          &gt;
        </span>
        <input
          type="search"
          placeholder="search terms"
          aria-label="Search the glossary"
          value={query}
          onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
        />
      </label>
      <ul class="glossary-list">
        {list.map((g) => (
          <li key={g.id}>
            <button
              type="button"
              class="glossary-row"
              onClick={() => {
                setOpen(g);
                record({ kind: 'glossaryRead', term: g.id });
              }}
            >
              <span class="stack">
                <span class="glossary-term">
                  {g.term}
                  {seen.has(g.id) && <span class="mono tiny dim"> · read</span>}
                </span>
                <span class="tiny dim">{g.short}</span>
              </span>
            </button>
          </li>
        ))}
        {list.length === 0 && <li class="small dim">No term matches that.</li>}
      </ul>
      {open && <TermSheet entry={open} onClose={() => setOpen(null)} />}
    </section>
  );
}

export function Learn() {
  return (
    <>
      <h1 class="screen-title">Learn</h1>
      <p class="small dim">Tap any dotted word in the app to see what it means. Reading cards counts toward daily quests.</p>
      <Glossary />
    </>
  );
}
