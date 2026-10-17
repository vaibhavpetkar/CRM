import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { UPLOAD_DIR } from '../config/upload';
import { AppError, ConflictError, NotFoundError, ValidationError } from '../errors/AppError';
import logger from '../utils/logger';

/**
 * Database + uploads backups for the super admin (Settings > Backups).
 *
 * One backup is a PostgreSQL dump in pg_dump's custom format
 * (`<base>.dump`, restorable with pg_restore) and, next to it, a tar.gz of
 * the uploads folder (attachments, generated PDFs, call recordings) named
 * `<base>.uploads.tar.gz`. Both live in BACKUP_DIR, which in Docker is the
 * `backups_data` volume.
 *
 * pg_dump / pg_restore / tar are always started with an argument array
 * (never through a shell) and the database password is passed in PGPASSWORD.
 */

export const BACKUP_DIR = path.resolve(process.env.BACKUP_DIR || path.join(__dirname, '../../backups'));

export const BACKUP_KINDS = ['manual', 'auto', 'pre-restore', 'uploaded'] as const;
export type BackupKind = (typeof BACKUP_KINDS)[number];

// crm-<kind>-YYYYMMDD-HHMMSSZ[-n].dump   (timestamp is UTC)
const BASE = `crm-(${BACKUP_KINDS.join('|')})-(\\d{8})-(\\d{6})Z(?:-(\\d{1,3}))?`;
const DUMP_RE = new RegExp(`^${BASE}\\.dump$`);
const FILE_RE = new RegExp(`^${BASE}\\.(?:dump|uploads\\.tar\\.gz)$`);

const UPLOADS_SUFFIX = '.uploads.tar.gz';

/** A database dump name, the thing you restore or delete. */
export const isValidBackupName = (name: unknown): name is string =>
  typeof name === 'string' && name.length <= 80 && DUMP_RE.test(name);

/** Any file that belongs to a backup (its dump or its uploads archive), the thing you download. */
export const isValidBackupFileName = (name: unknown): name is string =>
  typeof name === 'string' && name.length <= 100 && FILE_RE.test(name);

export const uploadsArchiveName = (dumpName: string) => dumpName.replace(/\.dump$/, UPLOADS_SUFFIX);

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

export const backupTimestamp = (d: Date = new Date()) =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-` +
  `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

/** When the backup was taken, read back from its name. */
export const parseBackupDate = (name: string): Date | null => {
  const m = DUMP_RE.exec(name) || FILE_RE.exec(name);
  if (!m) return null;
  const [, , day, time] = m;
  const d = new Date(
    Date.UTC(+day.slice(0, 4), +day.slice(4, 6) - 1, +day.slice(6, 8), +time.slice(0, 2), +time.slice(2, 4), +time.slice(4, 6))
  );
  return Number.isNaN(d.getTime()) ? null : d;
};

export const kindOf = (name: string): BackupKind | null => {
  const m = FILE_RE.exec(name);
  return m ? (m[1] as BackupKind) : null;
};

/**
 * Absolute path of a backup file. Throws unless the name passes the strict
 * whitelist, so nothing outside BACKUP_DIR can ever be reached.
 */
export const resolveBackupFile = (name: unknown): string => {
  if (!isValidBackupFileName(name)) throw new ValidationError('Invalid backup name.');
  const full = path.join(BACKUP_DIR, name);
  if (path.dirname(full) !== BACKUP_DIR) throw new ValidationError('Invalid backup name.');
  return full;
};

const ensureDir = () => fs.mkdirSync(BACKUP_DIR, { recursive: true });

// ─── Running the tools ────────────────────────────────────────────────────────

const pgEnv = (): NodeJS.ProcessEnv => ({
  ...process.env,
  PGHOST: process.env.DB_HOST || 'localhost',
  PGPORT: String(process.env.DB_PORT || 5432),
  PGUSER: process.env.DB_USERNAME || 'postgres',
  PGPASSWORD: process.env.DB_PASSWORD || '',
  PGDATABASE: process.env.DB_NAME || '',
});

const dbName = () => {
  const name = process.env.DB_NAME;
  if (!name) throw new AppError('DB_NAME is not set on the server.', 500);
  return name;
};

/** Runs a program with an argument array (no shell). Rejects with its stderr on failure. */
export const runTool = (cmd: string, args: string[], env: NodeJS.ProcessEnv = process.env): Promise<string> =>
  new Promise((resolve, reject) => {
    let stderr = '';
    let stdout = '';
    const child = spawn(cmd, args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', (chunk) => {
      stdout = (stdout + chunk).slice(-4000);
    });
    child.stderr.on('data', (chunk) => {
      stderr = (stderr + chunk).slice(-4000);
    });
    child.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') {
        reject(new AppError(`${cmd} is not installed on the server. Rebuild the backend image (it installs the PostgreSQL client tools).`, 500));
      } else {
        reject(new AppError(`${cmd} could not start: ${err.message}`, 500));
      }
    });
    child.on('close', (code) => {
      if (code === 0) return resolve(stdout);
      const detail = stderr.trim().split('\n').slice(-5).join(' ').replace(/PGPASSWORD=\S+/g, 'PGPASSWORD=***');
      reject(new AppError(`${cmd} failed (exit ${code})${detail ? `: ${detail}` : ''}`, 500));
    });
  });

const removeQuietly = (file: string) => {
  try {
    fs.rmSync(file, { force: true });
  } catch {
    /* ignore */
  }
};

const sizeOf = (file: string): number | null => {
  try {
    return fs.statSync(file).size;
  } catch {
    return null;
  }
};

// ─── One operation at a time ──────────────────────────────────────────────────

let busy: string | null = null;

/** What is running right now ("backup", "restore"), or null. */
export const currentOperation = () => busy;

const withLock = async <T>(label: string, fn: () => Promise<T>): Promise<T> => {
  if (busy) throw new ConflictError(`A ${busy} is already running. Please wait for it to finish.`);
  busy = label;
  try {
    return await fn();
  } finally {
    busy = null;
  }
};

// ─── Listing ──────────────────────────────────────────────────────────────────

export interface BackupInfo {
  name: string;
  kind: BackupKind;
  size: number;
  createdAt: string;
  uploadsArchive: { name: string; size: number } | null;
}

export const listBackups = (): BackupInfo[] => {
  ensureDir();
  const files = fs.readdirSync(BACKUP_DIR);
  const present = new Set(files);
  const backups: (BackupInfo & { mtimeMs: number })[] = [];
  for (const name of files) {
    if (!isValidBackupName(name)) continue;
    const full = path.join(BACKUP_DIR, name);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(full);
    } catch {
      continue;
    }
    if (!stat.isFile()) continue;
    const archive = uploadsArchiveName(name);
    const archiveSize = present.has(archive) ? sizeOf(path.join(BACKUP_DIR, archive)) : null;
    backups.push({
      name,
      kind: kindOf(name) as BackupKind,
      size: stat.size,
      createdAt: (parseBackupDate(name) || stat.mtime).toISOString(),
      uploadsArchive: archiveSize === null ? null : { name: archive, size: archiveSize },
      mtimeMs: stat.mtimeMs,
    });
  }
  // Newest first; several taken in the same second fall back to file time.
  return backups
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : b.mtimeMs - a.mtimeMs))
    .map(({ mtimeMs: _mtime, ...info }) => info);
};

export const getBackup = (name: string): BackupInfo => {
  if (!isValidBackupName(name)) throw new ValidationError('Invalid backup name.');
  const found = listBackups().find((b) => b.name === name);
  if (!found) throw new NotFoundError('Backup', name);
  return found;
};

/** A fresh, unused dump name for a backup of this kind taken now. */
export const newBackupName = (kind: BackupKind, now: Date = new Date()): string => {
  ensureDir();
  const base = `crm-${kind}-${backupTimestamp(now)}`;
  for (let n = 1; n < 1000; n++) {
    const name = n === 1 ? `${base}.dump` : `${base}-${n}.dump`;
    if (!fs.existsSync(path.join(BACKUP_DIR, name))) return name;
  }
  throw new ConflictError('Too many backups in the same second.');
};

// ─── Pruning ──────────────────────────────────────────────────────────────────

export const keepCount = () => {
  const raw = process.env.BACKUP_KEEP;
  if (raw === undefined || raw.trim() === '') return 30;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.floor(n) : 30;
};

/** Deletes the oldest backups beyond BACKUP_KEEP (0 or less keeps everything). */
export const pruneBackups = (protect: string[] = []): string[] => {
  const keep = keepCount();
  if (keep <= 0) return [];
  const removed: string[] = [];
  for (const b of listBackups().slice(keep)) {
    if (protect.includes(b.name)) continue;
    removeQuietly(path.join(BACKUP_DIR, b.name));
    removeQuietly(path.join(BACKUP_DIR, uploadsArchiveName(b.name)));
    removed.push(b.name);
  }
  if (removed.length) logger.info(`Backups: pruned ${removed.length} old backup(s) (BACKUP_KEEP=${keep}): ${removed.join(', ')}`);
  return removed;
};

// ─── Backup ───────────────────────────────────────────────────────────────────

const includeUploads = () => !/^(0|false|no|off)$/i.test(process.env.BACKUP_INCLUDE_UPLOADS || '');

const uploadsDirHasFiles = () => {
  try {
    return fs.readdirSync(UPLOAD_DIR).length > 0;
  } catch {
    return false;
  }
};

const createBackupUnlocked = async (kind: BackupKind, protect: string[] = []): Promise<BackupInfo & { warning?: string }> => {
  const name = newBackupName(kind);
  const dumpPath = path.join(BACKUP_DIR, name);
  const dumpPart = `${dumpPath}.part`;
  const started = Date.now();

  try {
    await runTool('pg_dump', ['--format=custom', '--file', dumpPart, '--dbname', dbName()], pgEnv());
    fs.renameSync(dumpPart, dumpPath);
  } catch (err) {
    removeQuietly(dumpPart);
    throw err;
  }

  let warning: string | undefined;
  if (includeUploads() && uploadsDirHasFiles()) {
    const archivePath = path.join(BACKUP_DIR, uploadsArchiveName(name));
    const archivePart = `${archivePath}.part`;
    try {
      await runTool('tar', ['-czf', archivePart, '-C', UPLOAD_DIR, '.']);
      fs.renameSync(archivePart, archivePath);
    } catch (err) {
      removeQuietly(archivePart);
      warning = `Database saved, but the uploads folder could not be archived: ${(err as Error).message}`;
      logger.warn(`Backups: ${warning}`);
    }
  }

  pruneBackups([name, ...protect]);
  const info = getBackup(name);
  logger.info(`Backups: created ${name} (${info.size} bytes${info.uploadsArchive ? ` + uploads ${info.uploadsArchive.size} bytes` : ''}) in ${Date.now() - started}ms`);
  return warning ? { ...info, warning } : info;
};

/** Takes a backup now. */
export const createBackup = (kind: BackupKind = 'manual', performedBy?: string) =>
  withLock('backup', async () => {
    const info = await createBackupUnlocked(kind);
    logger.info(`Backups: ${kind} backup ${info.name} taken${performedBy ? ` by ${performedBy}` : ''}`);
    return info;
  });

export const deleteBackup = (name: string, performedBy?: string) => {
  const backup = getBackup(name);
  if (busy) throw new ConflictError(`A ${busy} is running. Please wait for it to finish.`);
  removeQuietly(path.join(BACKUP_DIR, backup.name));
  removeQuietly(path.join(BACKUP_DIR, uploadsArchiveName(backup.name)));
  logger.info(`Backups: deleted ${backup.name}${performedBy ? ` by ${performedBy}` : ''}`);
};

// ─── Restore ──────────────────────────────────────────────────────────────────

/** Every pg_dump custom-format archive starts with these bytes. */
export const isCustomFormatDump = (file: string): boolean => {
  let fd: number | null = null;
  try {
    fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(5);
    const read = fs.readSync(fd, buf, 0, 5, 0);
    return read === 5 && buf.toString('latin1') === 'PGDMP';
  } catch {
    return false;
  } finally {
    if (fd !== null) fs.closeSync(fd);
  }
};

export interface RestoreResult {
  restored: string;
  safetyBackup: string;
  uploadsRestored: boolean;
}

const restoreUnlocked = async (name: string, opts: { restoreUploads?: boolean }, performedBy?: string): Promise<RestoreResult> => {
  const backup = getBackup(name);
  const dumpPath = path.join(BACKUP_DIR, backup.name);
  if (!isCustomFormatDump(dumpPath)) {
    throw new ValidationError('This file is not a pg_dump custom-format backup (.dump made with pg_dump -Fc).');
  }

  // Safety net first: if the restore turns out to be the wrong one, this
  // backup brings back exactly what was there a moment ago.
  const safety = await createBackupUnlocked('pre-restore', [backup.name]);
  logger.warn(`Backups: restoring ${backup.name}${performedBy ? ` (by ${performedBy})` : ''}; safety backup ${safety.name}`);

  await runTool(
    'pg_restore',
    ['--clean', '--if-exists', '--no-owner', '--single-transaction', '--exit-on-error', '--dbname', dbName(), dumpPath],
    pgEnv()
  );

  let uploadsRestored = false;
  if (opts.restoreUploads && backup.uploadsArchive) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    await runTool('tar', ['-xzf', path.join(BACKUP_DIR, backup.uploadsArchive.name), '-C', UPLOAD_DIR]);
    uploadsRestored = true;
  }

  logger.warn(`Backups: restored ${backup.name}${uploadsRestored ? ' (database + uploads)' : ' (database)'}${performedBy ? ` by ${performedBy}` : ''}`);
  return { restored: backup.name, safetyBackup: safety.name, uploadsRestored };
};

/** Replaces the whole database with a backup, after taking a pre-restore backup. */
export const restoreBackup = (name: string, opts: { restoreUploads?: boolean } = {}, performedBy?: string) =>
  withLock('restore', () => restoreUnlocked(name, opts, performedBy));

/**
 * Takes an uploaded file (already on disk inside BACKUP_DIR), keeps it as a
 * `crm-uploaded-…` backup and restores it.
 */
export const restoreUploadedFile = (tempPath: string, performedBy?: string) =>
  withLock('restore', async () => {
    if (path.dirname(path.resolve(tempPath)) !== BACKUP_DIR) {
      removeQuietly(tempPath);
      throw new ValidationError('Invalid upload.');
    }
    if (!isCustomFormatDump(tempPath)) {
      removeQuietly(tempPath);
      throw new ValidationError('This file is not a pg_dump custom-format backup (.dump made with pg_dump -Fc).');
    }
    const name = newBackupName('uploaded');
    fs.renameSync(tempPath, path.join(BACKUP_DIR, name));
    logger.info(`Backups: received uploaded backup ${name}${performedBy ? ` from ${performedBy}` : ''}`);
    return restoreUnlocked(name, {}, performedBy);
  });

/** Where multer puts an incoming upload before it is checked. */
export const uploadTempDir = () => {
  ensureDir();
  return BACKUP_DIR;
};

// ─── Tool versions (shown on the Backups page) ────────────────────────────────

export const toolVersions = async () => {
  const version = async (cmd: string) => {
    try {
      return (await runTool(cmd, ['--version'])).trim();
    } catch {
      return null;
    }
  };
  const [pgDump, pgRestore] = await Promise.all([version('pg_dump'), version('pg_restore')]);
  return { pgDump, pgRestore };
};

// ─── Daily automatic backup ───────────────────────────────────────────────────

// India Standard Time has no daylight saving, so a fixed offset is exact.
const IST_OFFSET_MS = 330 * 60 * 1000;

/**
 * Milliseconds from `now` until the next HH:MM in IST, or null if `at`
 * isn't a valid HH:MM.
 */
export const msUntilNextDaily = (at: string, now: Date = new Date()): number | null => {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec((at || '').trim());
  if (!m) return null;
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  let target = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate(), +m[1], +m[2]) - IST_OFFSET_MS;
  if (target <= now.getTime()) target += 24 * 60 * 60 * 1000;
  return target - now.getTime();
};

let timer: NodeJS.Timeout | null = null;

/** Starts the daily backup if BACKUP_DAILY_AT (e.g. "02:30", IST) is set. Off by default. */
export const startBackupScheduler = () => {
  const at = process.env.BACKUP_DAILY_AT;
  if (!at || !at.trim()) return;
  const schedule = () => {
    const wait = msUntilNextDaily(at);
    if (wait === null) {
      logger.error(`Backups: BACKUP_DAILY_AT="${at}" is not a valid HH:MM time; daily backups are off.`);
      return;
    }
    timer = setTimeout(async () => {
      try {
        await createBackup('auto', 'daily schedule');
      } catch (err) {
        logger.error(`Backups: daily backup failed: ${(err as Error).message}`);
      }
      schedule();
    }, wait);
    timer.unref();
  };
  schedule();
  if (timer) logger.info(`Backups: daily backup scheduled at ${at} IST`);
};

export const stopBackupScheduler = () => {
  if (timer) clearTimeout(timer);
  timer = null;
};
