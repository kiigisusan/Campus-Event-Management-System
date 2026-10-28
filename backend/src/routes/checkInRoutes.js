/**
 * /api/v1/check-in
 *
 * Used by the organizer's QR scanner page (html5-qrcode on the frontend).
 */
import { Router } from 'express';
import * as checkInController from '../controllers/checkInController.js';
import { authenticate, authorize } from '../middleware/authenticate.js';
import { validate } from '../middleware/validate.js';
import { checkInSchema } from '../validators/checkInValidators.js';

const router = Router();

router.post(
  '/',
  authenticate,
  authorize('organizer', 'admin'),
  validate({ body: checkInSchema }),
  checkInController.checkIn,
);

export default router;
