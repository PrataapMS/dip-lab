import type { NewsItem } from '../engine/protocol';
import { barTime } from '../engine/intraday';
import { formatRoute } from './router';

const TONE_MARK = { up: '+', down: '−', flat: '·' } as const;

/** News lines, newest first, each with its day, time and a signed tone mark. */
export function NewsList({ items, empty }: { items: readonly NewsItem[]; empty: string }) {
  if (items.length === 0) return <p class="small dim">{empty}</p>;
  return (
    <ul class="news mono">
      {items.map((n, k) => (
        <li key={`${n.day}-${n.bar}-${n.ticker}-${k}`} class={n.kind === 'headline' ? 'headline' : n.mine ? 'mine' : ''}>
          <span class="dim when">
            d{n.day + 1} {barTime(n.bar)}
          </span>
          <span class={`mark ${n.tone}`} aria-hidden="true">
            {TONE_MARK[n.tone]}
          </span>
          <span class="what">
            {n.ticker && n.kind !== 'headline' ? (
              <a href={formatRoute({ name: 'stock', ticker: n.ticker })}>{n.text}</a>
            ) : (
              n.text
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
