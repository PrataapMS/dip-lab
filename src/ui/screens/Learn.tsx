import { useState } from 'preact/hooks';
import { DEFAULT_ACCOUNT_SETTINGS } from '../../engine/account';
import { SCENARIOS } from '../../engine/scenarios';
import { isUnlocked, levelFor, UNLOCKS } from '../../game/levels';
import { XP } from '../../game/xp';
import { CHALLENGES, type Challenge } from '../../learn/challenges';
import { type GlossaryEntry, GLOSSARY, searchGlossary } from '../../learn/glossary';
import { type Lesson, LESSONS, lessonById } from '../../learn/lessons';
import { LockIcon } from '../BadgeIcon';
import { BackIcon, PlayIcon } from '../icons';
import { navigate } from '../router';
import { TermSheet } from '../Term';
import type { Market } from '../useMarket';
import { useProgress } from '../useProgress';

const scenarioName = (id: string) => SCENARIOS.find((s) => s.id === id)?.name ?? id;

function LessonView({ lesson }: { lesson: Lesson }) {
  const { progress, finishLesson } = useProgress();
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const wasDone = !!progress.lessons[lesson.id];
  const [paid] = useState(wasDone);
  const onCheck = step >= lesson.cards.length;
  const right = picked === lesson.check.answer;

  const pick = (k: number) => {
    if (picked !== null && right) return;
    setPicked(k);
    if (k === lesson.check.answer) finishLesson(lesson);
  };

  return (
    <>
      <header class="stack gap-8">
        <div class="row">
          <a class="icon-button" href="#/learn" aria-label="Back to Learn">
            <BackIcon />
          </a>
          <span class="mono tiny dim">
            lesson · {Math.min(step + 1, lesson.cards.length + 1)}/{lesson.cards.length + 1}
          </span>
        </div>
        <h1 class="picker-title">{lesson.title}</h1>
        <div class="lesson-steps" aria-hidden="true">
          {[...lesson.cards, null].map((_, k) => (
            <span key={k} class={k <= step ? 'on' : ''} />
          ))}
        </div>
      </header>

      {!onCheck ? (
        <section class="panel lesson-card">
          <p>{lesson.cards[step]}</p>
          <div class="row">
            <button type="button" class="ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>
              Back
            </button>
            <button type="button" class="primary" onClick={() => setStep(step + 1)}>
              {step === lesson.cards.length - 1 ? 'Quick check' : 'Next'}
            </button>
          </div>
        </section>
      ) : (
        <section class="panel lesson-card" aria-labelledby="check-q">
          <span class="mono tiny accent">// QUICK CHECK</span>
          <p id="check-q" class="strong">
            {lesson.check.question}
          </p>
          <div class="stack gap-8" role="group" aria-label="Answers">
            {lesson.check.options.map((o, k) => (
              <button
                key={o}
                type="button"
                class={`answer ${picked === k ? (k === lesson.check.answer ? 'right' : 'wrong') : ''}`}
                aria-pressed={picked === k}
                onClick={() => pick(k)}
              >
                {o}
              </button>
            ))}
          </div>
          {picked !== null && (
            <p class={`small ${right ? 'accent' : 'down'}`} role="status">
              {right ? 'Right. ' : 'Not quite, try again. '}
              {right && lesson.check.explain}
            </p>
          )}
          {right && (
            <div class="stack gap-8">
              <span class="mono small xp">{paid ? 'Done (XP already earned)' : `Done · +${XP.lesson} XP`}</span>
              {lesson.tryIt && (
                <a class="button ghost" href="#/new">
                  <PlayIcon /> Try it in {scenarioName(lesson.tryIt)}
                </a>
              )}
              <a class="button primary" href="#/learn">
                Back to lessons
              </a>
            </div>
          )}
        </section>
      )}
    </>
  );
}

function Lessons() {
  const { progress } = useProgress();
  const done = LESSONS.filter((l) => progress.lessons[l.id]).length;
  return (
    <section class="stack gap-8" aria-labelledby="lessons-title">
      <div class="row baseline">
        <h2 id="lessons-title" class="title small-title">
          Lessons
        </h2>
        <span class="mono tiny dim">
          {done}/{LESSONS.length} done
        </span>
      </div>
      {LESSONS.map((l) => {
        const isDone = !!progress.lessons[l.id];
        return (
          <a key={l.id} class={`lesson-row ${isDone ? 'done' : ''}`} href={`#/learn/${l.id}`}>
            <span class="quest-check" aria-hidden="true">
              {isDone && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="5 12 10 17 19 7" />
                </svg>
              )}
            </span>
            <span class="stack grow">
              <span class="quest-text">{l.title}</span>
              <span class="tiny dim">
                {l.cards.length} cards · 1 question{isDone ? ' · done' : ''}
              </span>
            </span>
            <span class={`mono small ${isDone ? 'dim' : 'xp'}`}>+{XP.lesson} XP</span>
          </a>
        );
      })}
    </section>
  );
}

function Challenges({ market }: { market: Market }) {
  const { progress } = useProgress();
  const level = levelFor(progress.xp).level;
  const start = (c: Challenge) => {
    const running = market.view.ready && !market.view.finished ? market.view.scenario : null;
    if (running && !confirm(`Leave ${running.name} and start the challenge?`)) return;
    market.startRun({ scenarioId: c.scenarioId, seed: c.seed, settings: DEFAULT_ACCOUNT_SETTINGS, challenge: c.id });
    navigate({ name: 'market' });
  };
  return (
    <section class="stack gap-8" aria-labelledby="challenges-title">
      <div class="row baseline">
        <h2 id="challenges-title" class="title small-title">
          Challenges
        </h2>
        <span class="mono tiny dim">same market every try</span>
      </div>
      {CHALLENGES.map((c) => {
        const best = progress.challenges[c.id];
        const locked = c.scenarioId === 'meme-squeeze' && !isUnlocked('meme-squeeze', level, progress.unlockAll);
        return (
          <div key={c.id} class={`panel challenge ${best ? 'done' : ''} ${locked ? 'locked' : ''}`}>
            <div class="row">
              <span class="stack">
                <span class="quest-text">{c.title}</span>
                <span class="tiny dim">{scenarioName(c.scenarioId)}</span>
              </span>
              <span class={`mono small ${best ? 'accent' : 'xp'}`}>{best ? `passed · ${best.letter}` : `+${c.xp} XP`}</span>
            </div>
            <p class="small">{c.goal}</p>
            {locked ? (
              <p class="small dim locked-rule">
                <LockIcon size={16} /> Unlocks at Lv {UNLOCKS['meme-squeeze'].level}
              </p>
            ) : (
              <button type="button" class={best ? 'ghost' : 'primary'} onClick={() => start(c)}>
                <PlayIcon /> {best ? 'Try again' : 'Start challenge'}
              </button>
            )}
          </div>
        );
      })}
    </section>
  );
}

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

export function Learn({ market, lesson }: { market: Market; lesson?: string }) {
  const found = lesson ? lessonById(lesson) : undefined;
  if (found) return <LessonView key={found.id} lesson={found} />;
  return (
    <>
      <h1 class="screen-title">Learn</h1>
      <p class="small dim">Short lessons, challenges on a fixed market, and every term in plain words. Tap any dotted word in the app to see what it means.</p>
      <Lessons />
      <Challenges market={market} />
      <Glossary />
    </>
  );
}
