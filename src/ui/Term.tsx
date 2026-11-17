import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { type GlossaryEntry, glossaryEntry } from '../learn/glossary';
import { trapTab, useReturnFocus } from './focus';
import { CloseIcon } from './icons';
import { useBackClose } from './router';
import { useProgress } from './useProgress';

/** The glossary card, as a small bottom sheet above everything else. */
export function TermSheet({ entry, onClose }: { entry: GlossaryEntry; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  useReturnFocus();
  useBackClose(onClose);
  useEffect(() => {
    close.current?.focus();
  }, []);
  return (
    <div class="sheet-layer term-layer">
      <button type="button" class="scrim" aria-label="Close" onClick={onClose} />
      <div
        class="sheet term-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={entry.term}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
          trapTab(e, e.currentTarget);
        }}
      >
        <div class="row">
          <span class="mono tiny accent">// GLOSSARY</span>
          <button
            ref={close}
            type="button"
            class="icon-button"
            aria-label="Close"
            onClick={onClose}
          >
            <CloseIcon />
          </button>
        </div>
        <h2 class="term-title">{entry.term}</h2>
        <p class="term-short">{entry.short}</p>
        <p class="small dim">{entry.why}</p>
        {entry.example && <p class="mono small term-example">&gt; {entry.example}</p>}
        <a
          class="link small"
          href={entry.lesson ? `#/learn/${entry.lesson}` : '#/learn'}
          onClick={onClose}
        >
          {entry.lesson ? 'Read the lesson' : 'More in Learn'}
        </a>
      </div>
    </div>
  );
}

/**
 * A word with a dotted underline that opens its glossary card. Use it on labels and plain
 * text, never inside another button or link.
 */
export function Term({ id, children }: { id: string; children: ComponentChildren }) {
  const [open, setOpen] = useState(false);
  const { record } = useProgress();
  const entry = glossaryEntry(id);
  if (!entry) return <>{children}</>;
  return (
    <>
      <button
        type="button"
        class="term"
        aria-haspopup="dialog"
        title={entry.short}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
          record({ kind: 'glossaryRead', term: id });
        }}
      >
        {children}
      </button>
      {open && <TermSheet entry={entry} onClose={() => setOpen(false)} />}
    </>
  );
}
