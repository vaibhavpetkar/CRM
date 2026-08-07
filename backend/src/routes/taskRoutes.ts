import { Router } from 'express';
import * as taskController from '../controllers/taskController';
import { protect, authorize } from '../middleware/authMiddleware';

const router = Router();

// Must come before /:id routes
router.get('/dashboard', protect, authorize('tasks:view'), taskController.getTaskDashboard);

router.get('/', protect, authorize('tasks:view'), taskController.getTasks);
router.post('/', protect, authorize('tasks:view'), taskController.createTask);
router.put('/:id', protect, authorize('tasks:view'), taskController.updateTask);
router.delete('/:id', protect, authorize('tasks:view'), taskController.deleteTask);

export default router;
