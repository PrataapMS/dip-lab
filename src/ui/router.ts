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

const STACK_MAX = 12;

const same = (a: Route, b: Route) => formatRoute(a) === formatRoute(b);

/** Bottom tabs and the debrief: opening one starts a fresh stack on top of Home. */
function isRoot(r: Route): boolean {
  return (
    r.name === 'market' ||
    r.name === 'portfolio' ||
    (r.name === 'learn' && !r.lesson) ||
    r.name === 'debrief'
  );
}

/** The stack a screen gets when nothing earlier is known (fresh start, link, reload). */
export function stackFor(r: Route): Stack {
  if (r.name === 'home') return [HOME];
  if (isRoot(r)) return [HOME, r];
  if (r.name === 'stock') return [HOME, { name: 'market' }, r];
  if (r.name === 'learn') return [HOME, { name: 'learn' }, r];
  return [HOME, r];
}

/** Opening `r` from `stack`, like a native app: tabs reset, screens already open pop back. */
export function pushRoute(stack: Stack, r: Route): Stack {
  if (r.name === 'home' || isRoot(r)) return stackFor(r);
  const at = stack.findIndex((s) => same(s, r));
  if (at >= 0) return stack.slice(0, at + 1);
  const next = [...stack, r];
  return next.length > STACK_MAX ? [next[0] as Route, ...next.slice(-(STACK_MAX - 1))] : next;
}

/** The stack after Back, or null when Back would leave the app. */
export function popRoute(stack: Stack): Stack | null {
  return stack.length > 1 ? stack.slice(0, -1) : null;
}

export function topOf(stack: Stack): Route {
  return stack[stack.length - 1] ?? HOME;
}

/* ---------- Browser history ---------- */

/*
 * The browser keeps two entries: a "base" one and the "top" one the player sits on. Moving
 * between screens only rewrites the top entry, so the browser history never grows. Back lands
 * on the base entry; the popstate handler then closes the open sheet or goes up one screen and
 * pushes a fresh top entry. On Home it opens the exit prompt instead and stays on the base
 * entry, so one more Back (or "exit") leaves the app.
 */

interface TopState {
  dl: 'top';
  stack: string[];
}

function isTopState(s: unknown): s is TopState {
  return (
    typeof s === 'object' &&
    s !== null &&
    (s as TopState).dl === 'top' &&
    Array.isArray((s as TopState).stack)
  );
}

let stack: Stack = [HOME];
let started = false;
/** False while the exit prompt shows (the player is on the base entry). */
let onTop = true;
let exitOpen = false;
let leaving = false;
const routeListeners = new Set<() => void>();
const exitListeners = new Set<() => void>();
/** Open sheets and dialogs: Back closes the newest first. */
const closers: (() => void)[] = [];

function topState(): TopState {
  return { dl: 'top', stack: stack.map(formatRoute) };
}

function pushTop(): void {
  history.pushState(topState(), '', formatRoute(topOf(stack)));
  onTop = true;
}

function setExit(open: boolean): void {
  if (exitOpen === open) return;
  exitOpen = open;
  for (const l of exitListeners) l();
}

function emitRoute(): void {
  for (const l of routeListeners) l();
}

function onPopState(e: PopStateEvent): void {
  if (isTopState(e.state)) {
    // Forward onto a top entry (desktop browsers): take its screens back.
    stack = e.state.stack.map(parseRoute);
    onTop = true;
    setExit(false);
    emitRoute();
    return;
  }
  if (e.state === null && onTop) {
    // A new entry on top of ours: a hash typed or opened from outside. Open it as a screen.
    stack = pushRoute(stack, parseRoute(location.hash));
    history.replaceState(topState(), '', formatRoute(topOf(stack)));
    setExit(false);
    emitRoute();
    return;
  }
  // Back past the top entry.
  onTop = false;
  if (leaving || exitOpen) {
    leaveApp();
    return;
  }
  const close = closers[closers.length - 1];
  if (close) {
    pushTop();
    close();
    return;
  }
  const up = popRoute(stack);
  if (up) {
    stack = up;
    pushTop();
    emitRoute();
    return;
  }
  setExit(true);
}

/** Opening a link: a tap on any `#/...` link goes through `navigate`, not the browser. */
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
  if (isTopState(history.state)) {
    stack = history.state.stack.map(parseRoute);
    if (!same(topOf(stack), here)) stack = stackFor(here);
    history.replaceState(topState(), '', formatRoute(here));
  } else {
    stack = stackFor(here);
    history.replaceState({ dl: 'base' }, '', location.href);
    pushTop();
  }
  window.addEventListener('popstate', onPopState);
  document.addEventListener('click', onClick);
}

/** Open a screen, like tapping through in a native app. */
export function navigate(r: Route): void {
  start();
  const next = pushRoute(stack, r);
  const changed = !same(topOf(next), topOf(stack));
  stack = next;
  if (onTop) history.replaceState(topState(), '', formatRoute(topOf(stack)));
  else pushTop();
  setExit(false);
  if (changed) emitRoute();
}

/** An on-screen back arrow: up one screen (`fallback` when the stack has nothing below). */
export function goBack(fallback: Route = HOME): void {
  start();
  const up = popRoute(stack);
  if (up) {
    stack = up;
    history.replaceState(topState(), '', formatRoute(topOf(stack)));
    emitRoute();
  } else navigate(fallback);
}

/** Leave the app: back past the base entry, or close the window when it was opened alone. */
export function leaveApp(): void {
  leaving = true;
  if (onTop) {
    // Two steps back (top, then base); popstate on the base entry continues the walk.
    history.back();
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
  if (!onTop) pushTop();
  setExit(false);
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => {
    start();
    return topOf(stack);
  });
  useEffect(() => {
    const onChange = () => setRoute(topOf(stack));
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

/** While mounted, the system Back button calls `close` instead of changing screens. */
export function useBackClose(close: () => void, active = true): void {
  const latest = useRef(close);
  latest.current = close;
  useEffect(() => {
    if (!active) return;
    const fn = () => latest.current();
    closers.push(fn);
    return () => {
      const at = closers.lastIndexOf(fn);
      if (at >= 0) closers.splice(at, 1);
    };
  }, [active]);
}
