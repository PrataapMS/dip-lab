/** What the exit prompt says, picked from what the player would leave behind. */
export interface ExitContext {
  /** Current streak (0 when lapsed). */
  streak: number;
  /** A close or a lesson already counted today. */
  playedToday: boolean;
  /** Today's quests not done yet. */
  questsLeft: number;
  /** An unfinished run is loaded. */
  runOpen: boolean;
}

export interface ExitPitch {
  kind: 'streakRisk' | 'quests' | 'streakSafe' | 'run' | 'plain';
  emoji: string;
  title: string;
  body: string;
  stay: string;
  leave: string;
}

export function exitPitch(c: ExitContext): ExitPitch {
  if (c.streak > 0 && !c.playedToday)
    return {
      kind: 'streakRisk',
      emoji: '🔥',
      title: `your ${c.streak}-day streak is about to ghost you`,
      body: 'One market close or one lesson keeps it alive. Takes like a minute, fr.',
      stay: 'save my streak',
      leave: 'let it go 💀',
    };
  if (c.questsLeft > 0)
    return {
      kind: 'quests',
      emoji: '👀',
      title: `${c.questsLeft} quest${c.questsLeft === 1 ? '' : 's'} still open today`,
      body: "Free XP just sitting there. Leaving it on the table? Couldn't be me.",
      stay: 'get that XP',
      leave: 'later, promise',
    };
  if (c.streak >= 2)
    return {
      kind: 'streakSafe',
      emoji: '😎',
      title: `${c.streak}-day streak secured`,
      body: 'You ate today. See you tomorrow to keep it going.',
      stay: 'one more round',
      leave: 'peace out ✌️',
    };
  if (c.runOpen)
    return {
      kind: 'run',
      emoji: '📉',
      title: 'leaving mid-run? bold move',
      body: 'The dip might not wait for you. Your run will, though.',
      stay: 'back to it',
      leave: 'brb 👋',
    };
  return {
    kind: 'plain',
    emoji: '🥺',
    title: "wait, you're leaving already?",
    body: 'The market never sleeps (ok, nights and weekends). Come back soon and buy the dip.',
    stay: "nvm, I'm staying",
    leave: 'exit for now',
  };
}
