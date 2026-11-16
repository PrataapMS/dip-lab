import { useEffect, useState } from 'preact/hooks';

/** Screens the app can show. Kept in the URL hash so Back works and a reload keeps the tab. */
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
  | { name: 'stock'; ticker: string };

export const HOME: Route = { name: 'home' };

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  switch (parts[0]) {
    case 'learn':
      return parts[1] && /^[a-z0-9-]{1,40}$/.test(parts[1]) ? { name: 'learn', lesson: parts[1] } : { name: 'learn' };
    case 'market':
    case 'portfolio':
    case 'debrief':
    case 'badges':
    case 'new':
      return { name: parts[0] };
    case 'stock': {
      const ticker = decodeURIComponent(parts[1] ?? '').toUpperCase();
      return /^[A-Z.\-]{1,8}$/.test(ticker) ? { name: 'stock', ticker } : HOME;
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

export function navigate(r: Route): void {
  const hash = formatRoute(r);
  if (location.hash !== hash) location.hash = hash;
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseRoute(location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
