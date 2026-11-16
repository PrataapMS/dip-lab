import type { WorkerEvent } from '../engine/protocol';

/**
 * Short, quiet sound effects made with Web Audio: no audio files, nothing to download or
 * precache. The audio context starts on the first tap (browsers block sound before that) and
 * stays silent while the tab is hidden or sound is off in Settings.
 */

export type Cue = 'fill' | 'reject' | 'bell' | 'chime' | 'levelUp' | 'marginCall' | 'runEnd';

interface Note {
  /** Hz. */
  freq: number;
  /** Seconds after the cue starts. */
  at: number;
  dur: number;
  wave: OscillatorType;
  /** Relative loudness, 0 to 1. */
  gain: number;
}

const n = (freq: number, at: number, dur: number, wave: OscillatorType = 'triangle', gain = 1) => ({
  freq,
  at,
  dur,
  wave,
  gain,
});

export const CUES: Record<Cue, readonly Note[]> = {
  // Order filled: a short rising blip.
  fill: [n(880, 0, 0.07), n(1320, 0.06, 0.09)],
  // Rejected or expired: a soft low double tap.
  reject: [n(220, 0, 0.08, 'square', 0.5), n(196, 0.1, 0.1, 'square', 0.5)],
  // Closing bell.
  bell: [n(1046, 0, 0.5, 'sine', 0.7), n(2093, 0, 0.3, 'sine', 0.2)],
  // Quest done, badge earned.
  chime: [n(784, 0, 0.12), n(988, 0.09, 0.12), n(1175, 0.18, 0.2)],
  levelUp: [n(523, 0, 0.12), n(659, 0.1, 0.12), n(784, 0.2, 0.12), n(1046, 0.3, 0.35)],
  // Margin call or forced sale: a low warning.
  marginCall: [n(147, 0, 0.25, 'sawtooth', 0.45), n(139, 0.28, 0.3, 'sawtooth', 0.45)],
  runEnd: [n(659, 0, 0.15), n(523, 0.14, 0.15), n(784, 0.28, 0.4)],
};

/** Master volume: quiet by design. */
const VOLUME = 0.08;

/** The sound for something the engine reported, if any. */
export function cueFor(e: WorkerEvent): Cue | null {
  switch (e.type) {
    case 'orderResult':
      return e.ok ? null : 'reject';
    case 'orderUpdates':
      if (e.orders.some((o) => o.status === 'filled')) return 'fill';
      return e.orders.some((o) => o.status === 'rejected' || o.status === 'expired')
        ? 'reject'
        : null;
    case 'dayEnd':
      return 'bell';
    case 'alerts':
      return e.alerts.some((a) => !a.ok) ? 'marginCall' : null;
    case 'ended':
      return e.restored ? null : 'runEnd';
    default:
      return null;
  }
}

let ctx: AudioContext | null = null;
let enabled = true;
let armed = false;

/** Create (or wake) the audio context. Only works inside a tap or key press handler. */
export function startAudio(): void {
  if (!ctx && typeof AudioContext === 'function') {
    try {
      ctx = new AudioContext();
    } catch {
      ctx = null;
    }
  }
  void ctx?.resume().catch(() => {});
}

/** Start audio on the first tap or key press, as browsers require. */
function arm(): void {
  if (armed || typeof window === 'undefined') return;
  armed = true;
  window.addEventListener('pointerdown', startAudio, { passive: true });
  window.addEventListener('keydown', startAudio);
}

export function setSoundEnabled(on: boolean): void {
  enabled = on;
  if (on) arm();
}

export function play(cue: Cue): void {
  if (!enabled || !ctx || ctx.state !== 'running') return;
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
  const t0 = ctx.currentTime + 0.01;
  for (const note of CUES[cue]) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = note.wave;
    osc.frequency.value = note.freq;
    const start = t0 + note.at;
    const end = start + note.dur;
    // Quick attack, smooth decay: no clicks.
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(VOLUME * note.gain, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(end + 0.02);
  }
}
