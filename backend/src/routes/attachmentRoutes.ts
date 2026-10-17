import { Router } from 'express';
import * as attachmentController from '../controllers/attachmentController';
import { protect } from '../middleware/authMiddleware';
import { upload } from '../config/upload';

const router = Router();

// Attachments need the parent record's own permission (checked in the
// controller, since the record type is in the query, the multipart body or the
// stored row).
router.get('/', protect, attachmentController.listAttachments);
router.post('/', protect, upload.single('file'), attachmentController.uploadAttachment);
router.delete('/:id', protect, attachmentController.deleteAttachment);

export default router;
