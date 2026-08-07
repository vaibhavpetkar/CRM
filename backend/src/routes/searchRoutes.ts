import { Router } from 'express';
import * as searchController from '../controllers/searchController';
import { protect } from '../middleware/authMiddleware';

const router = Router();

router.get('/', protect, searchController.globalSearch);

export default router;
