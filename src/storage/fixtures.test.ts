import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { UNIVERSE } from '../data/universe';
import { debrief } from '../engine/debrief';
import { buildMarket } from '../engine/market';
import { dropUnlisted, restoreRun } from '../engine/save';
import { getScenario } from '../engine/scenarios';
import { migrate } from '../game/progress';
import { migrateSettings } from '../game/settings';
import { type BackupFile, describeBackup, parseBackup } from './backup';
import type { SlotBody } from './slots';

/**
 * Files written by Dip Lab 0.5 (save format 1, export file version 1), kept exactly as they
 * were. From 1.0 every later version must still open them: a format change needs a migration,
 * never a new fixture. They also pin the markets: same scenario and seed, same prices.
 */
function fixture(name: string): BackupFile {
  return parseBackup(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
}

function open(body: SlotBody) {
  const c = body.header.config;
  const market = buildMarket(getScenario(c.scenarioId), c.seed, UNIVERSE);
  const { save, dropped } = dropUnlisted(body.save, market);
  expect(dropped).toEqual([]);
  return restoreRun(market, save);
}

/** Opens a run and checks it against what its header said when it was saved. */
function check(body: SlotBody) {
  const run = open(body);
  const h = body.header;
  expect(run.clock.day).toBe(h.day);
  expect(run.clock.playing).toBe(false);
  expect(run.marks().value).toBeCloseTo(h.value, 6);
  expect(run.finished).toBe(h.finished);
  expect(run.branchOf?.day ?? null).toBe(h.branchDay);
  if (h.finished) expect(debrief(run).grade.letter).toBe(h.letter);
  return run;
}

describe('files from 0.5 still open', () => {
  it('a single run, mid-day with an open order', () => {
    const file = fixture('run-export-v1.json');
    expect(describeBackup(file)).toBe('First steps, day 15 of 61');
    const run = check(file.runs[0] as SlotBody);
    expect(run.clock.bar).toBe(37);
    expect(Object.keys(run.account.positions)).toEqual(['SPY', 'AAPL', 'KO']);
    expect(run.account.orders.filter((o) => o.status === 'open').map((o) => o.ticker)).toEqual([
      'AAPL',
    ]);
    expect(run.marks().value).toBeCloseTo(10_084.13, 2);
    // It plays on to the end.
    while (!run.finished) run.stepDay();
    expect(run.account.equityByDay).toHaveLength(61);
  });

  it('a full backup: progress, settings, a finished replay and a margin run with a short', () => {
    const file = fixture('full-backup-v1.json');
    expect(describeBackup(file)).toBe('Full backup. fixture_one: 1,450 XP, 1 badge, 2 saved runs');
    expect(migrate(file.progress)).toMatchObject({ name: 'fixture_one', xp: 1_450 });
    expect(migrateSettings(file.settings)).toMatchObject({
      sound: false,
      watchlist: ['NFLX', 'AAPL', 'KO'],
    });

    const replay = check(file.runs[0] as SlotBody);
    expect(replay.branchOf).toMatchObject({ day: 20 });
    expect(replay.marks().value).toBeCloseTo(10_411.29, 2);
    expect(debrief(replay).grade.letter).toBe('F');
    // Replay points survive: the first try's closes before the branch are there.
    expect(replay.accountAtClose(19).equityByDay).toHaveLength(20);

    const margin = check(file.runs[1] as SlotBody);
    expect(margin.account.settings).toMatchObject({ margin: true, shorts: true });
    expect(margin.account.positions.TSLA?.shares).toBeLessThan(0);
    expect(margin.account.cash).toBeLessThan(0);
    expect(margin.marks().value).toBeCloseTo(10_128.38, 2);
  });
});
