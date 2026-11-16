import { describe, expect, it } from 'vitest';
import { UNIVERSE } from '../data/universe';
import { buildMarket } from '../engine/market';
import { Run } from '../engine/run';
import { restoreRun, saveRun } from '../engine/save';
import { getScenario } from '../engine/scenarios';
import { emptyProgress } from '../game/progress';
import { defaultSettings } from '../game/settings';
import {
  BACKUP_VERSION,
  BackupError,
  backupFileName,
  describeBackup,
  makeBackup,
  parseBackup,
} from './backup';
import type { SlotBody } from './slots';

const market = buildMarket(getScenario('first-steps'), 4, UNIVERSE);

function runBody(): SlotBody {
  const run = new Run(market, undefined, undefined, { pauseAtClose: false });
  run.place({
    ticker: 'SPY',
    side: 'buy',
    type: 'market',
    amount: { kind: 'dollars', value: 3_000 },
  });
  for (let d = 0; d < 6; d++) run.stepDay();
  const config = { scenarioId: 'first-steps', seed: 4 };
  return {
    header: {
      slot: 2,
      config,
      scenarioName: 'First steps',
      day: run.clock.day,
      totalDays: market.dates.length,
      value: run.marks().value,
      startingCash: 10_000,
      spyReturn: 0.01,
      finished: false,
      letter: null,
      branchDay: null,
      savedAt: '2026-11-16T10:00:00.000Z',
      app: '0.5.0',
    },
    save: saveRun(run, config),
  };
}

describe('export files', () => {
  const body = runBody();

  it('a run survives export and import exactly', () => {
    const file = makeBackup({ app: '0.5.0', exportedAt: 'now', runs: [body] });
    const back = parseBackup(JSON.stringify(file));
    expect(back).toEqual(file);
    const run = restoreRun(market, back.runs[0]?.save as SlotBody['save']);
    expect(run.account).toEqual(body.save.account);
  });

  it('a full backup carries progress and settings', () => {
    const progress = {
      ...emptyProgress(),
      name: 'trader_42',
      xp: 1234,
      badges: { 'first-trade': 'x' },
    };
    const file = makeBackup({
      app: '0.5.0',
      exportedAt: 'now',
      progress,
      settings: defaultSettings(),
      runs: [body, body],
    });
    const back = parseBackup(JSON.stringify(file));
    expect(back.progress).toEqual(progress);
    expect(back.settings).toEqual(defaultSettings());
    expect(describeBackup(back)).toBe('Full backup. trader_42: 1,234 XP, 1 badge, 2 saved runs');
    expect(backupFileName(back, '2026-11-16')).toBe('dip-lab-backup-2026-11-16.json');
  });

  it('keeps a challenge only on its own market', () => {
    const withChallenge = (challenge: string, seed: number): SlotBody => ({
      ...body,
      header: { ...body.header, config: { scenarioId: 'first-steps', seed, challenge } },
    });
    const parse = (r: SlotBody) =>
      parseBackup(JSON.stringify(makeBackup({ app: '0.5.0', exportedAt: 'now', runs: [r] })))
        .runs[0]?.header.config;
    expect(parse(withChallenge('first-ahead', 1001))?.challenge).toBe('first-ahead');
    expect(parse(withChallenge('first-ahead', 4))).toEqual({ scenarioId: 'first-steps', seed: 4 });
    expect(parse(withChallenge('no-such-challenge', 4))?.challenge).toBeUndefined();
  });

  it('names and describes a single run', () => {
    const file = makeBackup({ app: '0.5.0', exportedAt: 'now', runs: [body] });
    expect(describeBackup(file)).toBe('First steps, day 6 of 61');
    expect(backupFileName(file, '2026-11-16')).toBe('dip-lab-run-first-steps-2026-11-16.json');
  });

  it('rejects files it cannot use, with plain messages', () => {
    const ok = makeBackup({ app: '0.5.0', exportedAt: 'now', runs: [body] });
    const bad = (x: unknown) => () => parseBackup(typeof x === 'string' ? x : JSON.stringify(x));
    expect(bad('{oops')).toThrow(/isn't JSON/);
    expect(bad({ hello: 1 })).toThrow(/isn't a Dip Lab export/);
    expect(bad({ ...ok, version: BACKUP_VERSION + 1 })).toThrow(/newer version/);
    expect(bad({ ...ok, runs: 'x' })).toThrow(/no runs list/);
    expect(bad({ ...ok, runs: [] })).toThrow(/nothing to import/);
    expect(bad({ ...ok, runs: [{ header: {}, save: {} }] })).toThrow(/Run 1 .* damaged/);
    expect(bad({ ...ok, progress: 5 })).toThrow(/progress record/);
    expect(bad({ hello: 1 })).toThrow(BackupError);
  });
});
