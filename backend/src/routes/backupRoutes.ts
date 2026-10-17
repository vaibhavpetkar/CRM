import { Router, type RequestHandler } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import path from 'path';
import { protect } from '../middleware/authMiddleware';
import { superAdminOnly } from '../middleware/superAdmin';
import { AppError, ValidationError } from '../errors/AppError';
import * as backupController from '../controllers/backupController';
import { uploadTempDir } from '../services/backupService';

const router = Router();

const MAX_UPLOAD_BYTES = Number(process.env.BACKUP_MAX_UPLOAD_BYTES) || 2 * 1024 * 1024 * 1024; // 2 GB

const backupUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadTempDir()),
    // Hidden temp name that never matches a backup name, so it isn't listed
    // until it has been checked and renamed.
    filename: (_req, _file, cb) => cb(null, `.upload-${crypto.randomBytes(12).toString('hex')}.part`),
  }),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 5 },
  fileFilter: (_req, file, cb) => {
    if (path.extname(file.originalname).toLowerCase() !== '.dump') {
      return cb(new ValidationError('Upload a .dump file (made with pg_dump -Fc or with Back up now).'));
    }
    cb(null, true);
  },
}).single('file');

// Turns multer's own errors (file too big, wrong field) into clean JSON.
const receiveBackupFile: RequestHandler = (req, res, next) => {
  backupUpload(req, res, (err: unknown) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return next(new AppError(`The file is larger than ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.`, 413));
      }
      return next(new ValidationError(`Upload failed: ${err.message}`));
    }
    return next(err);
  });
};

// Short-lived signed link (see createDownloadLink); checked by its own token.
router.get('/download', backupController.downloadWithToken);

// Everything else: logged in, and the super admin only.
router.use(protect, superAdminOnly);

router.get('/', backupController.listBackups);
router.post('/', backupController.createBackup);
router.post('/upload-restore', receiveBackupFile, backupController.uploadAndRestore);
router.get('/:name', backupController.downloadBackup);
router.post('/:name/download-link', backupController.createDownloadLink);
router.post('/:name/restore', backupController.restoreBackup);
router.delete('/:name', backupController.deleteBackup);

export default router;
