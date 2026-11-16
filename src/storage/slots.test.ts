import { describe, expect, it } from 'vitest';
import {
  CHUNK,
  chunksToWrite,
  createSaver,
  freeSlot,
  latestUnfinished,
  type SlotHeader,
  slotToReplace,
} from './slots';

function header(slot: number, savedAt: string, finished = false): SlotHeader {
  return {
    slot,
    config: { scenarioId: 'first-steps', seed: 1 },
    scenarioName: 'First steps',
    day: 3,
    totalDays: 63,
    value: 10_000,
    startingCash: 10_000,
    spyReturn: 0,
    finished,
    letter: finished ? 'B' : null,
    branchDay: null,
    savedAt,
    app: '0.5.0',
  };
}

describe('save slots', () => {
  it('a new run takes the first empty slot, or none when full', () => {
    expect(freeSlot([null, null, null])).toBe(0);
    expect(freeSlot([header(0, 'a'), null, header(2, 'b')])).toBe(1);
    expect(freeSlot([header(0, 'a'), header(1, 'b'), header(2, 'c')])).toBeNull();
  });

  it('suggests replacing a finished run first, then the oldest', () => {
    const t = (d: number) => `2026-11-1${d}T10:00:00.000Z`;
    expect(slotToReplace([header(0, t(3)), header(1, t(1)), header(2, t(2))])).toBe(1);
    expect(slotToReplace([header(0, t(3)), header(1, t(1)), header(2, t(5), true)])).toBe(2);
  });

  it('resumes the unfinished run saved last', () => {
    const t = (d: number) => `2026-11-1${d}T10:00:00.000Z`;
    expect(latestUnfinished([header(0, t(3)), header(1, t(5)), header(2, t(9), true)])?.slot).toBe(
      1,
    );
    expect(latestUnfinished([null, header(1, t(1), true), null])).toBeNull();
  });

  it('rewrites only the chunks with new closes', () => {
    expect(chunksToWrite(0, 0)).toEqual([]);
    expect(chunksToWrite(0, 1)).toEqual([0]);
    expect(chunksToWrite(10, 10)).toEqual([]);
    expect(chunksToWrite(10, 11)).toEqual([0]);
    expect(chunksToWrite(CHUNK - 1, CHUNK + 1)).toEqual([0, 1]);
    expect(chunksToWrite(CHUNK, CHUNK + 1)).toEqual([1]);
    expect(chunksToWrite(0, CHUNK * 3)).toEqual([0, 1, 2]);
  });

  it('coalesces save requests made while writing', async () => {
    let writes = 0;
    let release: () => void = () => {};
    const saver = createSaver(
      () =>
        new Promise<void>((r) => {
          writes++;
          release = r;
        }),
    );
    saver.request();
    saver.request();
    saver.request();
    expect(writes).toBe(1);
    release();
    await Promise.resolve();
    await Promise.resolve();
    expect(writes).toBe(2);
    release();
    await saver.idle();
    expect(writes).toBe(2);
    saver.request();
    expect(writes).toBe(3);
    release();
    await saver.idle();
  });

  it('keeps going after a failed write', async () => {
    let calls = 0;
    const saver = createSaver(async () => {
      calls++;
      if (calls === 1) throw new Error('disk full');
    });
    saver.request();
    await saver.idle();
    saver.request();
    await saver.idle();
    expect(calls).toBe(2);
  });
});
