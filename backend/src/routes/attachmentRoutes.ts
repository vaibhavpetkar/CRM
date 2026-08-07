import { Router } from 'express';
import * as attachmentController from '../controllers/attachmentController';
import { protect } from '../middleware/authMiddleware';
import { upload } from '../config/upload';

const router = Router();

// Any authenticated user can view/upload/delete attachments on records they
// can already see — permission scoping happens at the parent entity's own
// routes (e.g. leads:read gates whether they can load the Lead in the first
// place). This mirrors how ERPNext treats attachments as part of the record.
router.get('/', protect, attachmentController.listAttachments);
router.post('/', protect, upload.single('file'), attachmentController.uploadAttachment);
router.delete('/:id', protect, attachmentController.deleteAttachment);

export default router;
