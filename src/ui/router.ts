import { useEffect, useRef, useState } from 'preact/hooks';

/** Screens the app can show. Kept in the URL hash so a reload keeps the screen. */
export type Route =
  | { name: 'home' }
  | { name: 'market' }
  | { name: 'portfolio' }
  /** The Learn tab, or one lesson in it. */
  | { name: 'learn'; lesson?: string }
  | { name: 'debrief' }
  | { name: 'badges' }
  /** Pick your run. */
  | { name: 'new' }
  | { name: 'settings' }
  | { name: 'stock'; ticker: string };

export const HOME: Route = { name: 'home' };

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  switch (parts[0]) {
    case 'learn':
      return parts[1] && /^[a-z0-9-]{1,40}$/.test(parts[1])
        ? { name: 'learn', lesson: parts[1] }
        : { name: 'learn' };
    case 'market':
    case 'portfolio':
    case 'debrief':
    case 'badges':
    case 'new':
    case 'settings':
      return { name: parts[0] };
    case 'stock': {
      const ticker = decodeURIComponent(parts[1] ?? '').toUpperCase();
      return /^[A-Z.-]{1,8}$/.test(ticker) ? { name: 'stock', ticker } : HOME;
    }
    default:
      return HOME;
  }
}

export function formatRoute(r: Route): string {
  if (r.name === 'stock') return `#/stock/${encodeURIComponent(r.ticker)}`;
  if (r.name === 'learn' && r.lesson) return `#/learn/${r.lesson}`;
  return `#/${r.name}`;
}

/* ---------- Back stack (pure) ---------- */

/** Screens Back walks through, oldest first; always starts at Home. */
export type Stack = readonly Route[];

const same = (a: Route, b: Route) => formatRoute(a) === formatRoute(b);

/** The stack a screen gets when nothing earlier is known (fresh start, link, reload). */
export function stackFor(r: Route): Stack {
  if (r.name === 'home') return [HOME];
  if (r.name === 'stock') return [HOME, { name: 'market' }, r];
  if (r.name === 'learn' && r.lesson) return [HOME, { name: 'learn' }, r];
  return [HOME, r];
}

/**
 * Opening `r` from `stack`. A screen already in the stack (a tab visited earlier, say) pops
 * back to it, so Back never bounces between the same screens; anything else goes on top.
 */
export function pushRoute(stack: Stack, r: Route): Stack {
  if (r.name === 'home') return [HOME];
  const at = stack.findIndex((s) => same(s, r));
  return at >= 0 ? stack.slice(0, at + 1) : [...stack, r];
}

/** `r` takes the place of the top screen (opened without a tap, e.g. when a run ends). */
export function replaceTop(stack: Stack, r: Route): Stack {
  return pushRoute(stack.length > 1 ? stack.slice(0, -1) : stack, r);
}

/** The stack after Back, or null when Back would leave the app. */
export function popRoute(stack: Stack): Stack | null {
  return stack.length > 1 ? stack.slice(0, -1) : null;
}

export function topOf(stack: Stack): Route {
  return stack[stack.length - 1] ?? HOME;
}

/** Whether `a` is `b` with screens taken off the top. */
export function isBelow(a: Stack, b: Stack): boolean {
  return a.length < b.length && a.every((r, k) => same(r, b[k] as Route));
}

/* ---------- Browser history ---------- */

/*
 * Browser history mirrors the stack: a "guard" entry, then one entry per screen, then one per
 * open sheet. System Back is a plain browser traversal and popstate reads the screen from the
 * entry it lands on, so the app never pushes history from popstate. Chrome skips entries a
 * page adds without a user gesture, so entries are only pushed during a tap; until the first
 * tap there is no guard. Back onto the guard shows the exit prompt; Back again leaves.
 * Going "up" to a screen already in the stack (a tab, Home) travels back through history.
 */

interface Entry {
  dl: 'app';
  stack: string[];
  /** Screen entries at and below this one (0: no guard below yet). */
  real: number;
  /** Sheet entries on top of the screen. */
  sheet: number;
}

interface Current {
  stack: Stack;
  real: number;
  sheet: number;
}

function isEntry(s: unknown): s is Entry {
  return (
    typeof s === 'object' &&
    s !== null &&
    (s as Entry).dl === 'app' &&
    Array.isArray((s as Entry).stack) &&
    (s as Entry).stack.length > 0
  );
}

function isGuard(s: unknown): boolean {
  return typeof s === 'object' && s !== null && (s as { dl?: string }).dl === 'guard';
}

let cur: Current = { stack: [HOME], real: 0, sheet: 0 };
/** Which kind of entry the browser is on. */
let where: 'entry' | 'guard' = 'entry';
let started = false;
let exitOpen = false;
let leaving = false;
/** Written onto the entry the next popstate lands on (going up into a folded screen). */
let pendingReplace: Entry | null = null;
const routeListeners = new Set<() => void>();
const exitListeners = new Set<() => void>();
/** Open sheets and dialogs, oldest first: Back closes the newest. */
const closers: (() => void)[] = [];

function entry(c: Current): Entry {
  return { dl: 'app', stack: c.stack.map(formatRoute), real: c.real, sheet: c.sheet };
}

function fromEntry(e: Entry): Current {
  return { stack: e.stack.map(parseRoute), real: e.real, sheet: e.sheet ?? 0 };
}

function write(kind: 'push' | 'replace', c: Current): void {
  const url = formatRoute(topOf(c.stack));
  if (kind === 'push') history.pushState(entry(c), '', url);
  else history.replaceState(entry(c), '', url);
  cur = c;
  where = 'entry';
}

/** Inside a tap (or with no way to tell): history entries added now are kept by Chrome. */
function tapping(): boolean {
  const ua = (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation;
  return ua ? ua.isActive : true;
}

/** Write `c` to history and show its screen. */
function commit(kind: 'push' | 'replace', c: Current): void {
  const changed = !same(topOf(c.stack), topOf(cur.stack));
  write(kind, c);
  if (changed) emitRoute();
}

function show(c: Current): void {
  const changed = !same(topOf(c.stack), topOf(cur.stack));
  cur = c;
  if (changed) emitRoute();
}

function emitRoute(): void {
  for (const l of routeListeners) l();
}

function setExit(open: boolean): void {
  if (exitOpen === open) return;
  exitOpen = open;
  for (const l of exitListeners) l();
}

/** One entry per screen of `stack`, on top of the guard. */
function pushScreens(stack: Stack): void {
  for (let k = 1; k <= stack.length; k++)
    write('push', { stack: stack.slice(0, k), real: k, sheet: 0 });
}

/** On a tap: put the guard under the app, so Back on Home can ask before leaving. */
function arm(): void {
  if (exitOpen || !tapping()) return;
  if (where === 'guard') pushScreens(cur.stack);
  else if (cur.real === 0) {
    const stack = cur.stack;
    history.replaceState({ dl: 'guard' }, '', formatRoute(HOME));
    pushScreens(stack);
  }
}

function closeSheetsAbove(n: number): void {
  while (closers.length > n) closers.pop()?.();
}

function onPopState(e: PopStateEvent): void {
  const s: unknown = e.state;
  if (isEntry(s)) {
    leaving = false;
    setExit(false);
    let next = fromEntry(s);
    if (pendingReplace) {
      history.replaceState(pendingReplace, '', formatRoute(topOf(fromEntry(pendingReplace).stack)));
      next = fromEntry(pendingReplace);
      pendingReplace = null;
    }
    where = 'entry';
    closeSheetsAbove(next.sheet);
    // Back onto the entry of a sheet that is no longer open (left by a link inside it): skip it.
    const stale = next.sheet - closers.length;
    const goingBack = next.real < cur.real || (next.real === cur.real && next.sheet < cur.sheet);
    if (stale > 0 && goingBack) {
      history.go(-stale);
      return;
    }
    show(next);
    return;
  }
  if (isGuard(s)) {
    where = 'guard';
    if (leaving) {
      leaveApp();
      return;
    }
    closeSheetsAbove(0);
    if (cur.stack.length > 1) {
      // The bottom entry stood for more than one screen: go up one; the next tap re-arms.
      show({ stack: cur.stack.slice(0, -1), real: 0, sheet: 0 });
      return;
    }
    setExit(true);
    return;
  }
  // No state: Back from the guard into an older page entry, or a hash opened from outside.
  if (leaving || exitOpen || where === 'guard') {
    leaveApp();
    return;
  }
  const stack = pushRoute(cur.stack, parseRoute(location.hash));
  closeSheetsAbove(0);
  commit('replace', { stack, real: cur.real ? cur.real + 1 : 0, sheet: 0 });
}

/** A tap on any `#/...` link goes through `navigate`, not the browser. */
function onClick(e: MouseEvent): void {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
    return;
  const a = (e.target as Element | null)?.closest?.('a[href^="#"]');
  if (!a || (a as HTMLAnchorElement).target) return;
  e.preventDefault();
  navigate(parseRoute(a.getAttribute('href') ?? ''));
}

function start(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  const here = parseRoute(location.hash);
  const s: unknown = history.state;
  if (isEntry(s) && same(topOf(fromEntry(s).stack), here)) {
    cur = fromEntry(s);
    where = 'entry';
  } else if (isGuard(s)) {
    cur = { stack: [HOME], real: 0, sheet: 0 };
    where = 'guard';
  } else write('replace', { stack: stackFor(here), real: 0, sheet: 0 });
  window.addEventListener('popstate', onPopState);
  for (const type of ['pointerdown', 'pointerup', 'touchend', 'keydown', 'click'])
    window.addEventListener(type, arm, { capture: true, passive: true });
  document.addEventListener('click', onClick);
}

/** Open a screen. */
export function navigate(r: Route): void {
  start();
  arm();
  if (exitOpen) {
    setExit(false);
    if (tapping()) pushScreens([HOME]);
  }
  const target = pushRoute(cur.stack, r);
  if (same(topOf(target), topOf(cur.stack))) return;
  if (where === 'guard' || cur.real === 0) {
    // No history to move through yet: just show it.
    const c = { stack: target, real: 0, sheet: 0 };
    if (where === 'entry') commit('replace', c);
    else show(c);
    return;
  }
  if (isBelow(target, cur.stack)) {
    const up = cur.stack.length - target.length;
    if (cur.real - up >= 1) {
      history.go(-(up + cur.sheet));
      return;
    }
    // The target is folded into the bottom entry: go there and rewrite it.
    const bottom = { stack: target, real: 1, sheet: 0 };
    const steps = cur.real - 1 + cur.sheet;
    if (steps) {
      pendingReplace = entry(bottom);
      history.go(-steps);
    } else commit('replace', bottom);
    return;
  }
  // A new screen: its own entry when tapped (a sheet's entry is reused), else it takes the
  // top screen's place.
  if (cur.sheet) commit('replace', { stack: target, real: cur.real + 1, sheet: 0 });
  else if (tapping()) commit('push', { stack: target, real: cur.real + 1, sheet: 0 });
  else commit('replace', { stack: replaceTop(cur.stack, r), real: cur.real, sheet: 0 });
}

/** An on-screen back arrow: up one screen (`fallback` when nothing is below). */
export function goBack(fallback: Route = HOME): void {
  start();
  const below = cur.stack[cur.stack.length - 2];
  navigate(below ?? fallback);
}

/** Leave the app: back past the guard, or close the window when it was opened alone. */
export function leaveApp(): void {
  leaving = true;
  if (where === 'entry' && cur.real >= 1) {
    // Back to the guard first; popstate there carries on.
    history.go(-(cur.real + cur.sheet));
    return;
  }
  history.back();
  window.close();
  // Still here (an installed app opened on this page): nowhere to go back to.
  setTimeout(() => {
    leaving = false;
  }, 400);
}

/** Close the exit prompt and carry on. */
export function stay(): void {
  setExit(false);
  if (where === 'guard' && tapping()) pushScreens([HOME]);
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => {
    start();
    return topOf(cur.stack);
  });
  useEffect(() => {
    const onChange = () => setRoute(topOf(cur.stack));
    routeListeners.add(onChange);
    // The route can change between the first render and this effect: catch up with it.
    onChange();
    return () => {
      routeListeners.delete(onChange);
    };
  }, []);
  return route;
}

/** Whether the exit prompt is showing. */
export function useExitPrompt(): boolean {
  const [open, setOpen] = useState(exitOpen);
  useEffect(() => {
    const onChange = () => setOpen(exitOpen);
    exitListeners.add(onChange);
    onChange();
    return () => {
      exitListeners.delete(onChange);
    };
  }, []);
  return open;
}

/**
 * While mounted (and `active`), the sheet gets its own history entry, so the system Back
 * button closes it instead of changing screens. Closing it on screen drops that entry.
 */
export function useBackClose(close: () => void, active = true): void {
  const latest = useRef(close);
  latest.current = close;
  useEffect(() => {
    if (!active) return;
    const fn = () => latest.current();
    closers.push(fn);
    if (where === 'entry' && cur.real >= 1 && tapping())
      write('push', { ...cur, sheet: cur.sheet + 1 });
    return () => {
      const at = closers.lastIndexOf(fn);
      if (at >= 0) closers.splice(at, 1);
      // Closed on screen (not by Back): take its entry off once the click has finished.
      setTimeout(() => {
        const extra = cur.sheet - closers.length;
        if (where === 'entry' && extra > 0 && isEntry(history.state)) {
          cur = { ...cur, sheet: closers.length };
          history.go(-extra);
        }
      }, 0);
    };
  }, [active]);
}
