import { Router } from 'express';
import { getDeletedRecords, restoreRecord } from '../controllers/recycleBinController';
import { protect, authorize } from '../middleware/authMiddleware';

const router = Router();

// Allow Admin and maybe specific roles to view and restore deleted items
router.get('/', protect, authorize('Administrator', 'Sales Manager', 'recycle_bin:manage'), getDeletedRecords);
router.post('/restore', protect, authorize('Administrator', 'Sales Manager', 'recycle_bin:manage'), restoreRecord);

export default router;
