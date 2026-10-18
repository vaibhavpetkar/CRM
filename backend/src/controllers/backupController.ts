import type { Request, Response } from 'express';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import { asyncHandler } from '../utils/errorHandler';
import { AppError, NotFoundError, UnauthorizedError, ValidationError } from '../errors/AppError';
import * as backups from '../services/backupService';

type AuthedRequest = Request & { user?: { id: number; email?: string } };

const who = (req: AuthedRequest) => (req.user ? `${req.user.email || 'user'} (#${req.user.id})` : undefined);

/** Restores replace every company's data, so the caller has to type RESTORE. */
const requireConfirm = (body: unknown) => {
  const confirm = (body as { confirm?: unknown } | undefined)?.confirm;
  if (confirm !== 'RESTORE') {
    throw new ValidationError('Type RESTORE to confirm. Restoring replaces all current data.');
  }
};

const truthy = (v: unknown) => v === true || v === 'true' || v === '1' || v === 1;

export const listBackups = asyncHandler(async (_req, res) => {
  const [items, tools] = await Promise.all([Promise.resolve(backups.listBackups()), backups.toolVersions()]);
  res.json({
    backups: items,
    running: backups.currentOperation(),
    keep: backups.keepCount(),
    dailyAt: process.env.BACKUP_DAILY_AT || null,
    tools,
  });
});

export const createBackup = asyncHandler(async (req: AuthedRequest, res) => {
  const backup = await backups.createBackup('manual', who(req));
  res.status(201).json({ message: 'Backup created.', backup });
});

export const deleteBackup = asyncHandler(async (req: AuthedRequest, res) => {
  backups.deleteBackup(req.params.name, who(req));
  res.json({ message: 'Backup deleted.' });
});

const sendBackupFile = (res: Response, name: unknown) => {
  const file = backups.resolveBackupFile(name);
  if (!fs.existsSync(file)) throw new NotFoundError('Backup', String(name));
  res.setHeader('Cache-Control', 'no-store');
  res.download(file, String(name));
};

/** Download with the normal Authorization header (curl, scripts). */
export const downloadBackup = asyncHandler(async (req, res) => {
  sendBackupFile(res, req.params.name);
});

// Browsers can't add an Authorization header to a plain link, and a backup
// can be far too big to pull into memory as a blob first. So the page asks
// for a short-lived link that works for this one file only.
const DOWNLOAD_AUDIENCE = 'backup-download';

const secret = () => {
  const s = process.env.JWT_SECRET;
  if (!s) throw new AppError('JWT_SECRET is not set on the server.', 500);
  return s;
};

export const createDownloadLink = asyncHandler(async (req: AuthedRequest, res) => {
  const name = req.params.name;
  const file = backups.resolveBackupFile(name);
  if (!fs.existsSync(file)) throw new NotFoundError('Backup', name);
  const token = jwt.sign({ file: name, uid: req.user?.id }, secret(), { audience: DOWNLOAD_AUDIENCE, expiresIn: '5m' });
  res.json({ path: `/admin/backups/download?token=${encodeURIComponent(token)}` });
});

export const downloadWithToken = asyncHandler(async (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(token, secret(), { audience: DOWNLOAD_AUDIENCE }) as jwt.JwtPayload;
  } catch {
    throw new UnauthorizedError('This download link has expired. Go back and click Download again.');
  }
  sendBackupFile(res, payload.file);
});

export const restoreBackup = asyncHandler(async (req: AuthedRequest, res) => {
  requireConfirm(req.body);
  const result = await backups.restoreBackup(req.params.name, { restoreUploads: truthy(req.body?.restoreUploads) }, who(req));
  res.json({ message: 'Restore complete.', ...result });
});

export const uploadAndRestore = asyncHandler(async (req: AuthedRequest, res) => {
  const file = (req as Request & { file?: Express.Multer.File }).file;
  if (!file) throw new ValidationError('Choose a .dump backup file to upload.');
  try {
    requireConfirm(req.body);
  } catch (err) {
    fs.rmSync(file.path, { force: true });
    throw err;
  }
  let result: backups.RestoreResult;
  try {
    result = await backups.restoreUploadedFile(file.path, who(req));
  } finally {
    // Kept (renamed) when accepted; anything still at the temp path is rejected.
    fs.rmSync(file.path, { force: true });
  }
  res.json({ message: 'Restore complete.', ...result });
});
