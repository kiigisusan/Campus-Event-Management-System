/**
 * /api/v1/bookings
 */
import { Router } from 'express';
import * as bookingController from '../controllers/bookingController.js';
import * as paymentController from '../controllers/paymentController.js';
import { authenticate, authorize } from '../middleware/authenticate.js';
import { validate } from '../middleware/validate.js';
import { createBookingSchema, listMyBookingsSchema } from '../validators/bookingValidators.js';
import { idParamsSchema } from '../validators/common.js';
import { payForBookingSchema } from '../validators/paymentValidators.js';

const router = Router();

router.use(authenticate);

router.post(
  '/',
  authorize('student'),
  validate({ body: createBookingSchema }),
  bookingController.create,
);
router.get(
  '/me',
  authorize('student'),
  validate({ query: listMyBookingsSchema }),
  bookingController.listMine,
);
router.get(
  '/:id',
  authorize('student', 'admin'),
  validate({ params: idParamsSchema() }),
  bookingController.getById,
);
router.get(
  '/:id/qr',
  authorize('student'),
  validate({ params: idParamsSchema() }),
  bookingController.qrImage,
);
router.patch(
  '/:id/cancel',
  authorize('student'),
  validate({ params: idParamsSchema() }),
  bookingController.cancel,
);

// Paid events: send (or re-send) the M-Pesa prompt for a pending booking.
router.post(
  '/:id/pay',
  authorize('student'),
  validate({ params: idParamsSchema(), body: payForBookingSchema }),
  paymentController.payForBooking,
);

export default router;
