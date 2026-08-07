import { Router } from 'express';
import * as companyController from '../controllers/companyController';
import { protect, authorize } from '../middleware/authMiddleware';

const router = Router();

// Any authenticated user can read company settings (needed so formatCurrency()
// works correctly everywhere in the UI, not just for admins).
router.get('/', protect, companyController.getCompany);

// Only users with company management rights can change them (Administrators
// via the isSuperAdmin/'*' bypass in authorize()).
router.put('/', protect, authorize('company:manage'), companyController.updateCompany);

export default router;
