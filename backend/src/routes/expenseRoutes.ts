import { Router } from 'express';
import { protect, authorize } from '../middleware/authMiddleware';
import * as expenseController from '../controllers/expenseController';

const router = Router();

router.get('/', protect, authorize('expenses:read'), expenseController.getExpenses);
router.get('/categories', protect, authorize('expenses:read'), expenseController.getExpenseCategories);
router.post('/', protect, authorize('expenses:create'), expenseController.createExpense);
router.put('/:id', protect, authorize('expenses:update'), expenseController.updateExpense);
router.delete('/:id', protect, authorize('expenses:delete'), expenseController.deleteExpense);

export default router;
