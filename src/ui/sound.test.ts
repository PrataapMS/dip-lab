import { describe, expect, it } from 'vitest';
import type { Order } from '../engine/orders';
import type { WorkerEvent } from '../engine/protocol';
import { CUES, type Cue, cueFor } from './sound';

const order = (status: Order['status']) => ({ status }) as Order;

describe('sound cues', () => {
  it('every cue is a short run of audible notes', () => {
    for (const [cue, notes] of Object.entries(CUES)) {
      expect(notes.length, cue).toBeGreaterThan(0);
      for (const x of notes) {
        expect(x.freq).toBeGreaterThanOrEqual(100);
        expect(x.freq).toBeLessThanOrEqual(4000);
        expect(x.at + x.dur).toBeLessThanOrEqual(1);
        expect(x.gain).toBeGreaterThan(0);
        expect(x.gain).toBeLessThanOrEqual(1);
      }
    }
  });

  it('maps engine events to cues', () => {
    const cases: [WorkerEvent, Cue | null][] = [
      [{ type: 'orderResult', ok: false, order: null, message: '' }, 'reject'],
      [{ type: 'orderResult', ok: true, order: null, message: '' }, null],
      [{ type: 'orderUpdates', orders: [order('expired'), order('filled')] }, 'fill'],
      [{ type: 'orderUpdates', orders: [order('expired')] }, 'reject'],
      [{ type: 'orderUpdates', orders: [order('open')] }, null],
      [{ type: 'dayEnd', summary: {} as never }, 'bell'],
      [
        { type: 'alerts', alerts: [{ kind: 'marginCall', day: 1, ok: false, message: '' }] },
        'marginCall',
      ],
      [{ type: 'alerts', alerts: [{ kind: 'marginMet', day: 1, ok: true, message: '' }] }, null],
      [{ type: 'ended', reason: 'lastDay', debrief: {} as never, restored: false }, 'runEnd'],
      [{ type: 'ended', reason: 'lastDay', debrief: {} as never, restored: true }, null],
      [{ type: 'flushed' }, null],
    ];
    for (const [e, cue] of cases) expect(cueFor(e), e.type).toBe(cue);
  });
});
