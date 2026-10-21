/**
 * /api/v1/payments
 *
 * Students start payments through POST /bookings/:id/pay (bookingRoutes.js).
 * This router only receives Safaricom's server-to-server callback, so it has
 * no user authentication; the secret :token protects it instead.
 */
import { Router } from 'express';
import * as paymentController from '../controllers/paymentController.js';

const router = Router();

router.post('/mpesa/callback/:token', paymentController.mpesaCallback);

export default router;
