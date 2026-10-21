/**
 * HTTP layer for M-Pesa payments.
 */
import crypto from 'node:crypto';
import { env } from '../config/env.js';
import * as paymentService from '../services/paymentService.js';
import { ApiError } from '../utils/ApiError.js';
import { sendSuccess } from '../utils/response.js';
import { stkCallbackSchema } from '../validators/paymentValidators.js';

/** What Safaricom expects back; anything else makes it retry the callback. */
const ACCEPTED = { ResultCode: 0, ResultDesc: 'Accepted' };

/** Constant-time comparison, so the secret cannot be guessed from response timing. */
function isValidCallbackToken(token) {
  if (!env.MPESA_CALLBACK_TOKEN || typeof token !== 'string') return false;
  const expected = Buffer.from(env.MPESA_CALLBACK_TOKEN);
  const actual = Buffer.from(token);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

/** POST /bookings/:id/pay - send (or re-send) the M-Pesa prompt. */
export async function payForBooking(req, res) {
  const result = await paymentService.initiatePayment(
    {
      bookingId: req.validated.params.id,
      studentId: req.user.user_id,
      phoneNumber: req.validated.body.phone_number,
    },
    { ipAddress: req.ip },
  );
  const { student_id: _studentId, ...booking } = result.booking;
  sendSuccess(res, { booking, message: result.message }, { status: 202 });
}

/**
 * POST /payments/mpesa/callback/:token - called by Safaricom, not by users.
 *
 * Safaricom does not sign callbacks, so the secret token in the URL is what
 * proves the request came from the URL we gave Daraja. Once the token is
 * valid we always answer "Accepted": a malformed or unknown callback is
 * logged, and telling Safaricom to retry it would not help.
 */
export async function mpesaCallback(req, res) {
  if (!isValidCallbackToken(req.params.token)) {
    throw ApiError.notFound('Not found');
  }

  const parsed = stkCallbackSchema.safeParse(req.body);
  if (!parsed.success) {
    console.warn('Ignoring malformed M-Pesa callback:', JSON.stringify(req.body).slice(0, 500));
    return res.json(ACCEPTED);
  }

  await paymentService.handleStkCallback(parsed.data.Body.stkCallback);
  return res.json(ACCEPTED);
}
