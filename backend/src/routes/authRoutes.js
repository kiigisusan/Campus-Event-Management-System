/**
 * /api/v1/auth
 *
 * Rate limiters run before validation so that even malformed requests count
 * towards the limit.
 */
import { Router } from 'express';
import * as authController from '../controllers/authController.js';
import { authenticate } from '../middleware/authenticate.js';
import {
  forgotPasswordLimiter,
  loginLimiter,
  registerLimiter,
  twoFactorLimiter,
} from '../middleware/rateLimiters.js';
import { validate } from '../middleware/validate.js';
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyTwoFactorSchema,
} from '../validators/authValidators.js';

const router = Router();

router.post(
  '/register',
  registerLimiter,
  validate({ body: registerSchema }),
  authController.register,
);
router.post('/login', loginLimiter, validate({ body: loginSchema }), authController.login);
router.post(
  '/2fa/verify',
  twoFactorLimiter,
  validate({ body: verifyTwoFactorSchema }),
  authController.verifyTwoFactor,
);
router.post('/logout', authenticate, authController.logout);
router.get('/me', authenticate, authController.me);

router.post(
  '/forgot-password',
  forgotPasswordLimiter,
  validate({ body: forgotPasswordSchema }),
  authController.forgotPassword,
);
router.post(
  '/reset-password',
  validate({ body: resetPasswordSchema }),
  authController.resetPassword,
);

export default router;
