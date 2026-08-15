import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import { ValidationError } from '../errors/AppError';

const UPLOAD_DIR = path.join(__dirname, '../../uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const randomName = crypto.randomBytes(16).toString('hex');
    cb(null, `${randomName}${path.extname(file.originalname)}`);
  },
});

// Phase 25 security finding: uploads previously accepted any file type with
// no allowlist. Blocks anything that could execute/render as active content
// if a URL were ever opened directly (.html, .svg, .js, executables, etc.),
// while allowing every document/image/archive type this CRM's attachments
// feature is actually used for.
const ALLOWED_EXTENSIONS = new Set([
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.csv', '.txt', '.rtf',
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp',
  '.zip', '.rar', '.7z',
]);

const fileFilter: multer.Options['fileFilter'] = (_req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return cb(new ValidationError(`File type '${ext || 'unknown'}' isn't allowed.`));
  }
  cb(null, true);
};

// 15 MB per file — generous enough for typical attachments (docs, images, small PDFs)
// without letting a single upload exhaust disk/memory.
export const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter,
});

export { UPLOAD_DIR };
