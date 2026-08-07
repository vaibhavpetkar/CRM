import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';

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

// 15 MB per file — generous enough for typical attachments (docs, images, small PDFs)
// without letting a single upload exhaust disk/memory.
export const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
});

export { UPLOAD_DIR };
