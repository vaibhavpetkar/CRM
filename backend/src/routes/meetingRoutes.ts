import { Router } from 'express';
import * as meetingController from '../controllers/meetingController';
import { protect, authorize } from '../middleware/authMiddleware';

const router = Router();

router.get('/', protect, authorize('meetings:view'), meetingController.getMeetings);
router.post('/', protect, authorize('meetings:view'), meetingController.createMeeting);
router.put('/:id', protect, authorize('meetings:view'), meetingController.updateMeeting);
router.delete('/:id', protect, authorize('meetings:view'), meetingController.deleteMeeting);

export default router;
