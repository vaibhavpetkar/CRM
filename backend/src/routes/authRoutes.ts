import { Router } from 'express';
import {
  register,
  signupCompany,
  lookupCompany,
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
import { companyLookupRateLimiter, loginRateLimiter, passwordResetRateLimiter, registrationRateLimiter } from '../middleware/rateLimiter';

const router = Router();

// Public auth routes
router.post('/register', registrationRateLimiter, register);
router.post('/signup-company', registrationRateLimiter, signupCompany);
router.post('/login', loginRateLimiter, login);
router.get('/company/:code', companyLookupRateLimiter, lookupCompany);
router.post('/google', loginRateLimiter, googleLogin);
router.get('/verify-email/:token', verifyEmail);
router.post('/forgot-password', passwordResetRateLimiter, forgotPassword);
router.post('/reset-password/:token', passwordResetRateLimiter, resetPassword);

// Invitation routes
router.post('/invite', protect, authorize('users:invite'), sendInvitation);
router.get('/invite/:token', verifyInvitation);
router.post('/accept-invite', registrationRateLimiter, acceptInvitation);

// Protected routes
router.post('/change-password', protect, changePassword);
router.get('/me', protect, getMe);

export default router;