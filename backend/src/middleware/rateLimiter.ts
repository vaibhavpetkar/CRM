import rateLimit from 'express-rate-limit';

// Phase 25 security finding: none of the public auth endpoints
// (login/register/forgot-password/reset-password/invite-accept/google) had
// any brute-force protection — a single IP could hammer /login with
// unlimited password guesses. These limiters are IP-based and only apply to
// the specific public endpoints below; every other route, and legitimate
// traffic under the limits, is completely unaffected.

// Login: the most sensitive — guessable passwords, credential stuffing.
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many login attempts. Please try again in a few minutes.' },
});

// Password reset / forgot-password: prevents email-enumeration hammering
// and reset-token brute forcing.
export const passwordResetRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many password reset attempts. Please try again in a few minutes.' },
});

// Registration / invite-accept: looser than login, but still bounded.
export const registrationRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many attempts. Please try again later.' },
});
