import type { SlotBody } from './slots';

/**
 * Export files: one format for a single run or a full backup (progress, settings and every
 * saved run). Plain JSON, so it stays readable. Pure: the UI reads and writes the files.
 */

export const BACKUP_FORMAT = 'dip-lab';
export const BACKUP_VERSION = 1;

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  /** App version that wrote it. */
  app: string;
  exportedAt: string;
  /** Present in a full backup. */
  progress?: unknown;
  settings?: unknown;
  runs: SlotBody[];
}

/** A file that can't be imported, with a message fit to show the player. */
export class BackupError extends Error {
  override name = 'BackupError';
}

export function makeBackup(b: Omit<BackupFile, 'format' | 'version'>): BackupFile {
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, ...b };
}

export function isFullBackup(f: BackupFile): boolean {
  return f.progress !== undefined;
}

const isObject = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === 'object' && !Array.isArray(x);

/** The shape a run needs before the engine checks it against its market. */
function checkRun(r: unknown, i: number): SlotBody {
  const bad = () => new BackupError(`Run ${i + 1} in this file is damaged.`);
  if (!isObject(r) || !isObject(r.header) || !isObject(r.save)) throw bad();
  const c = r.header.config;
  if (!isObject(c) || typeof c.scenarioId !== 'string' || !Number.isFinite(c.seed)) throw bad();
  const s = r.save;
  if (
    typeof s.format !== 'number' ||
    !Array.isArray(s.snapshots) ||
    !isObject(s.account) ||
    !Array.isArray(s.account.equityByDay) ||
    !isObject(s.clock)
  )
    throw bad();
  if (typeof r.header.scenarioName !== 'string') throw bad();
  return r as unknown as SlotBody;
}

/** Reads an export file. Throws `BackupError` with a plain reason. */
export function parseBackup(text: string): BackupFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new BackupError("This isn't a Dip Lab file (it isn't JSON).");
  }
  if (!isObject(data) || data.format !== BACKUP_FORMAT)
    throw new BackupError("This isn't a Dip Lab export file.");
  if (typeof data.version !== 'number' || data.version > BACKUP_VERSION)
    throw new BackupError('This file comes from a newer version of Dip Lab. Update the app first.');
  if (!Array.isArray(data.runs))
    throw new BackupError('This file is damaged: it has no runs list.');
  const runs = data.runs.map(checkRun);
  if (data.progress !== undefined && !isObject(data.progress))
    throw new BackupError('This file is damaged: its progress record is unreadable.');
  if (!runs.length && data.progress === undefined)
    throw new BackupError('This file has nothing to import.');
  return {
    format: BACKUP_FORMAT,
    version: data.version,
    app: typeof data.app === 'string' ? data.app : '?',
    exportedAt: typeof data.exportedAt === 'string' ? data.exportedAt : '',
    ...(data.progress !== undefined ? { progress: data.progress } : {}),
    ...(data.settings !== undefined ? { settings: data.settings } : {}),
    runs,
  };
}

function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'run'
  );
}

/** `dip-lab-backup-2026-11-16.json` or `dip-lab-run-covid-crash-2026-11-16.json`. */
export function backupFileName(f: BackupFile, date: string): string {
  if (isFullBackup(f)) return `dip-lab-backup-${date}.json`;
  const first = f.runs[0];
  return `dip-lab-run-${slug(first?.header.scenarioName ?? 'run')}-${date}.json`;
}

/** One line on what a file holds. */
export function describeBackup(f: BackupFile): string {
  const runs = `${f.runs.length} saved run${f.runs.length === 1 ? '' : 's'}`;
  if (!isFullBackup(f)) {
    const h = f.runs[0]?.header;
    if (!h) return 'An empty run file';
    return `${h.scenarioName}, ${h.finished ? `finished${h.letter ? ` (${h.letter})` : ''}` : `day ${h.day + 1} of ${h.totalDays}`}`;
  }
  const p = f.progress as { xp?: unknown; name?: unknown; badges?: unknown };
  const xp = typeof p.xp === 'number' ? `${Math.round(p.xp).toLocaleString('en-US')} XP` : '? XP';
  const badges = isObject(p.badges) ? Object.keys(p.badges).length : 0;
  const who = typeof p.name === 'string' ? `${p.name}: ` : '';
  return `Full backup. ${who}${xp}, ${badges} badge${badges === 1 ? '' : 's'}, ${runs}`;
}
