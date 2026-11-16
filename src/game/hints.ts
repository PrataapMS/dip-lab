import type { Activity } from '../engine/activity';
import type { Progress } from './progress';
import { questsFor } from './quests';
import { XP } from './xp';

/**
 * The XP label on the order sheet's confirm button. Shown only when this order is the first
 * trade ever or would finish a daily quest; never for trading as such.
 */
export function orderXpHint(p: Progress, date: string, would: readonly Activity[]): string | null {
  if (!p.badges['first-trade'] && would.some((a) => a.kind === 'fill'))
    return `+${XP.badge} XP · first trade`;
  const state = p.quests?.date === date ? p.quests : null;
  let xp = 0;
  questsFor(date).forEach((q, k) => {
    if (state?.claimed[k]) return;
    let at = state?.progress[k] ?? 0;
    for (const a of would) {
      const m = q.measure(a);
      if (m) at = q.mode === 'add' ? at + m : Math.max(at, m);
    }
    if (at >= q.goal && at > (state?.progress[k] ?? 0)) xp += q.xp;
  });
  return xp ? `+${xp} XP · quest` : null;
}
