import { Router } from 'express';
import {
  register,
  login,
  googleLogin,
  sendInvitation,
  verifyInvitation,
  acceptInvitation,
  verifyEmail,
  forgotPassword,
  resetPassword,
  changePassword,
  getMe,
} from '../controllers/authController';
import { protect, authorize } from '../middleware/authMiddleware';

const router = Router();

// Public auth routes
router.post('/register', register);
router.post('/login', login);
router.post('/google', googleLogin);
router.get('/verify-email/:token', verifyEmail);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password/:token', resetPassword);

// Invitation routes
router.post('/invite', protect, authorize('users:invite'), sendInvitation);
router.get('/invite/:token', verifyInvitation);
router.post('/accept-invite', acceptInvitation);

// Protected routes
router.post('/change-password', protect, changePassword);
router.get('/me', protect, getMe);

export default router;