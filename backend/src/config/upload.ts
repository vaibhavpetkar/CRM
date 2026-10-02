import multer from 'multer';
import { AsyncResource } from 'async_hooks';
import type { RequestHandler } from 'express';
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
const multerUpload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter,
});

// multer finishes from the request stream's own events, which would drop the
// logged-in user's company context (tenancy/context.ts) before the route
// handler runs. Binding `next` to the caller's context keeps it.
const keepContext =
  (middleware: RequestHandler): RequestHandler =>
  (req, res, next) =>
    middleware(req, res, AsyncResource.bind(next));

export const upload = {
  single: (field: string) => keepContext(multerUpload.single(field)),
  array: (field: string, maxCount?: number) => keepContext(multerUpload.array(field, maxCount)),
  fields: (fields: multer.Field[]) => keepContext(multerUpload.fields(fields)),
  any: () => keepContext(multerUpload.any()),
  none: () => keepContext(multerUpload.none()),
};

export { UPLOAD_DIR };
