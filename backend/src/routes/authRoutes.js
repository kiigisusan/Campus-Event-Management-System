import { Router } from 'express';
import * as authController from '../controllers/authController.js';
import { authenticate } from '../middleware/authenticate.js';
import { validate } from '../middleware/validate.js';
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyTwoFactorSchema,
} from '../validators/authValidators.js';

const router = Router();

router.post('/register', validate({ body: registerSchema }), authController.register);
router.post('/login', validate({ body: loginSchema }), authController.login);
router.post(
  '/2fa/verify',
  validate({ body: verifyTwoFactorSchema }),
  authController.verifyTwoFactor,
);
router.post('/logout', authenticate, authController.logout);
router.get('/me', authenticate, authController.me);

router.post(
  '/forgot-password',
  validate({ body: forgotPasswordSchema }),
  authController.forgotPassword,
);
router.post(
  '/reset-password',
  validate({ body: resetPasswordSchema }),
  authController.resetPassword,
);

export default router;
