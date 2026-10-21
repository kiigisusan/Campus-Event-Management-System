/**
 * M-Pesa payments for paid bookings.
 *
 * Flow:
 *  1. POST /bookings                 -> booking 'pending', seat held (bookingService)
 *  2. POST /bookings/:id/pay         -> STK push prompt on the student's phone
 *  3. Safaricom -> POST /payments/mpesa/callback/:token with the result
 *        success -> payment 'completed', booking 'confirmed'
 *        failure -> payment 'failed', seat stays held so the student can retry (step 2)
 *  4. If nothing succeeds before expires_at, the expiry job cancels the
 *     booking and releases the seat (jobs/expirePendingBookings.js).
 *
 * Guarantees:
 *  - A booking is confirmed only after M-Pesa reports success.
 *  - Callbacks are idempotent: a repeated callback finds the payment no longer
 *    'pending' and changes nothing, so nothing is confirmed or counted twice.
 *  - Double-clicking "Pay" cannot send two prompts (see claimPaymentAttempt).
 *  - Money that arrives after the seat was released is never silently lost:
 *    the seat is re-taken if one is free, otherwise the payment is flagged for refund.
 */
import { env } from '../config/env.js';
import { prisma } from '../config/prisma.js';
import { AUDIT_ACTIONS } from '../constants/auditActions.js';
import { ApiError } from '../utils/ApiError.js';
import { hasEventStarted } from '../utils/eventTime.js';
import { recordAudit } from './auditService.js';
import { BOOKING_TX_OPTIONS, getBookingById, lockEvent, newQrToken } from './bookingService.js';
import * as daraja from './mpesa/darajaClient.js';
import { queueBookingConfirmation } from './notificationService.js';

/**
 * A 'pending' attempt older than this may be replaced by a new prompt.
 * Safaricom's PIN prompt times out after about a minute.
 */
export const STK_RETRY_AFTER_SECONDS = 90;

/**
 * @typedef {object} PaymentResult
 * @property {number} resultCode      0 = success, anything else = failure.
 * @property {string} resultDesc
 * @property {string} [mpesaReceipt]
 * @property {number} [amount]
 */

/**
 * Reserves the right to send an STK push for this booking. Done with a
 * conditional write *before* calling Safaricom, so two simultaneous "Pay"
 * requests cannot both get through: the second finds the attempt already
 * claimed and gets PAYMENT_IN_PROGRESS.
 */
async function claimPaymentAttempt(booking, { amount, phoneNumber }) {
  const inProgress = ApiError.conflict(
    'A payment request was already sent to your phone. Complete it, or try again in a minute.',
    'PAYMENT_IN_PROGRESS',
  );

  if (!booking.payment) {
    try {
      return await prisma.payment.create({
        data: { booking_id: booking.booking_id, amount, phone_number: phoneNumber },
      });
    } catch (error) {
      if (error.code === 'P2002') throw inProgress; // another request created it first
      throw error;
    }
  }

  const staleBefore = new Date(Date.now() - STK_RETRY_AFTER_SECONDS * 1000);
  const { count } = await prisma.payment.updateMany({
    where: {
      payment_id: booking.payment.payment_id,
      OR: [{ status: 'failed' }, { status: 'pending', transaction_date: { lt: staleBefore } }],
    },
    data: {
      status: 'pending',
      amount,
      phone_number: phoneNumber,
      transaction_date: new Date(),
      checkout_request_id: null,
      merchant_request_id: null,
      result_code: null,
      result_desc: null,
    },
  });
  if (count === 0) throw inProgress;
  return prisma.payment.findUnique({ where: { payment_id: booking.payment.payment_id } });
}

/**
 * Sends an M-Pesa STK push for a pending booking. Also used to retry after a
 * failed or cancelled payment while the seat is still held.
 *
 * @param {{ bookingId: number, studentId: number, phoneNumber: string }} input
 * @param {{ ipAddress?: string }} context
 */
export async function initiatePayment({ bookingId, studentId, phoneNumber }, { ipAddress } = {}) {
  let booking = await prisma.booking.findUnique({
    where: { booking_id: bookingId },
    include: { event: true, payment: true },
  });
  if (!booking || booking.student_id !== studentId) {
    throw ApiError.notFound('Booking not found', 'BOOKING_NOT_FOUND');
  }

  // A previous prompt that never reported back may in fact have been paid:
  // ask Safaricom before replacing it, so a completed payment is not lost.
  if (booking.payment?.status === 'pending' && booking.payment.checkout_request_id) {
    await reconcilePayment(booking.payment);
    booking = await prisma.booking.findUnique({
      where: { booking_id: bookingId },
      include: { event: true, payment: true },
    });
  }

  if (booking.status === 'confirmed' || booking.status === 'checked_in') {
    throw ApiError.conflict('This booking is already paid', 'ALREADY_PAID');
  }
  if (booking.status !== 'pending') {
    throw ApiError.conflict(
      'This booking is no longer waiting for payment. Please book again.',
      'BOOKING_NOT_PENDING',
    );
  }
  if (!booking.expires_at || booking.expires_at <= new Date()) {
    throw ApiError.conflict(
      'Your seat reservation has expired. Please book again.',
      'BOOKING_EXPIRED',
    );
  }

  const amount = Number(booking.event.price);
  const payment = await claimPaymentAttempt(booking, { amount, phoneNumber });

  let stk;
  try {
    stk = await daraja.stkPush({
      phoneNumber,
      amount,
      accountReference: `CEMS${bookingId}`,
      description: 'Event ticket',
    });
  } catch (error) {
    console.error(`STK push failed for booking ${bookingId}:`, error);
    await prisma.payment.update({
      where: { payment_id: payment.payment_id },
      data: { status: 'failed', result_desc: 'Could not reach M-Pesa' },
    });
    throw new ApiError(
      502,
      'MPESA_UNAVAILABLE',
      'We could not reach M-Pesa. Your seat is still held, please try again.',
    );
  }

  await prisma.payment.update({
    where: { payment_id: payment.payment_id },
    data: {
      checkout_request_id: stk.checkoutRequestId,
      merchant_request_id: stk.merchantRequestId,
    },
  });

  await recordAudit({
    userId: studentId,
    action: AUDIT_ACTIONS.PAYMENT_INITIATED,
    targetType: 'booking',
    targetId: bookingId,
    details: { amount, checkout_request_id: stk.checkoutRequestId },
    ipAddress,
  });

  if (daraja.isMockMode() && env.MPESA_MOCK_AUTO_CALLBACK) {
    scheduleMockCallback(stk.checkoutRequestId, phoneNumber, amount);
  }

  return {
    booking: await getBookingById(bookingId),
    message: 'Check your phone and enter your M-Pesa PIN to complete the payment.',
  };
}

/** Mock mode: plays Safaricom's part and reports the result after a short delay. */
function scheduleMockCallback(checkoutRequestId, phoneNumber, amount) {
  setTimeout(() => {
    applyPaymentResult(checkoutRequestId, daraja.mockResultFor(phoneNumber, amount)).catch(
      (error) => console.error('Simulated M-Pesa callback failed:', error),
    );
  }, env.MPESA_MOCK_DELAY_MS).unref();
}

/**
 * Turns a Daraja stkCallback body into a PaymentResult and applies it.
 * @param {object} stkCallback `Body.stkCallback` from Safaricom's request.
 */
export async function handleStkCallback(stkCallback) {
  const items = Object.fromEntries(
    (stkCallback.CallbackMetadata?.Item ?? []).map((item) => [item.Name, item.Value]),
  );
  return applyPaymentResult(stkCallback.CheckoutRequestID, {
    resultCode: Number(stkCallback.ResultCode),
    resultDesc: stkCallback.ResultDesc,
    mpesaReceipt: items.MpesaReceiptNumber ? String(items.MpesaReceiptNumber) : undefined,
    amount: items.Amount !== undefined ? Number(items.Amount) : undefined,
  });
}

/**
 * Applies the final result of an STK push. Safe to call any number of times
 * for the same checkout request: only the first call changes anything.
 *
 * @param {string} checkoutRequestId
 * @param {PaymentResult} result
 * @returns {Promise<{ outcome: 'unknown' | 'stale' | 'duplicate' | 'failed' | 'confirmed' | 'refund_required', bookingId?: number }>}
 */
export async function applyPaymentResult(checkoutRequestId, result) {
  const payment = await prisma.payment.findUnique({
    where: { checkout_request_id: checkoutRequestId },
    include: { booking: { select: { event_id: true } } },
  });
  if (!payment) {
    console.warn(`M-Pesa result for unknown CheckoutRequestID ${checkoutRequestId}`);
    return { outcome: 'unknown' };
  }

  const applied = await prisma.$transaction(async (tx) => {
    // Same lock order as booking/cancel/expiry: event row first.
    await lockEvent(tx, payment.booking.event_id);
    const current = await tx.payment.findUnique({
      where: { payment_id: payment.payment_id },
      include: { booking: { include: { event: true } } },
    });

    // A newer prompt replaced this one, or the result was already applied.
    if (current.checkout_request_id !== checkoutRequestId) return { outcome: 'stale' };
    if (current.status !== 'pending') return { outcome: 'duplicate' };

    const { booking } = current;
    const audit = (action, details) =>
      recordAudit(
        {
          userId: booking.student_id,
          action,
          targetType: 'booking',
          targetId: booking.booking_id,
          details: { checkout_request_id: checkoutRequestId, ...details },
        },
        { tx },
      );

    const underpaid = result.amount !== undefined && result.amount < Number(current.amount);
    if (result.resultCode !== 0 || underpaid) {
      const resultDesc = underpaid
        ? `Paid KES ${result.amount}, expected KES ${Number(current.amount)}`
        : result.resultDesc;
      await tx.payment.update({
        where: { payment_id: current.payment_id },
        data: {
          status: 'failed',
          result_code: result.resultCode,
          result_desc: resultDesc?.slice(0, 255),
          mpesa_receipt: underpaid ? result.mpesaReceipt : undefined,
        },
      });
      await audit(AUDIT_ACTIONS.PAYMENT_FAILED, {
        result_code: result.resultCode,
        result_desc: resultDesc,
        refund_due: underpaid,
      });
      return { outcome: 'failed', bookingId: booking.booking_id };
    }

    let outcome = 'confirmed';
    if (booking.status === 'pending') {
      await tx.booking.update({
        where: { booking_id: booking.booking_id },
        data: { status: 'confirmed', expires_at: null },
      });
    } else if (
      booking.status === 'cancelled' &&
      booking.event.status === 'approved' &&
      booking.event.spots_remaining > 0 &&
      !hasEventStarted(booking.event)
    ) {
      // The hold expired (or was cancelled) just before the money arrived,
      // but there is still room: give the student their seat back.
      await tx.event.update({
        where: { event_id: booking.event_id },
        data: { spots_remaining: { decrement: 1 } },
      });
      await tx.booking.update({
        where: { booking_id: booking.booking_id },
        data: { status: 'confirmed', expires_at: null, qr_code: newQrToken() },
      });
    } else {
      // Paid, but there is no seat to give: must be refunded by the organizer.
      outcome = 'refund_required';
    }

    await tx.payment.update({
      where: { payment_id: current.payment_id },
      data: {
        status: 'completed',
        mpesa_receipt: result.mpesaReceipt,
        result_code: 0,
        result_desc:
          outcome === 'refund_required'
            ? 'Paid after the seat was released - refund required'
            : result.resultDesc?.slice(0, 255),
        transaction_date: new Date(),
      },
    });
    await audit(
      outcome === 'refund_required'
        ? AUDIT_ACTIONS.PAYMENT_REFUND_REQUIRED
        : AUDIT_ACTIONS.PAYMENT_COMPLETED,
      { mpesa_receipt: result.mpesaReceipt, amount: Number(current.amount) },
    );

    return { outcome, bookingId: booking.booking_id };
  }, BOOKING_TX_OPTIONS);

  if (applied.outcome === 'confirmed') queueBookingConfirmation(applied.bookingId);
  return applied;
}

/**
 * Asks Safaricom for the result of a still-pending STK push and applies it.
 * Used before retrying a payment and by the expiry job, in case the callback
 * never arrived. Does nothing in mock mode or while the customer is still deciding.
 *
 * @param {{ checkout_request_id: string | null }} payment
 */
export async function reconcilePayment(payment) {
  if (!payment.checkout_request_id || daraja.isMockMode()) return null;
  try {
    const { resultCode, resultDesc } = await daraja.stkQuery(payment.checkout_request_id);
    if (resultCode === null) return null;
    return await applyPaymentResult(payment.checkout_request_id, { resultCode, resultDesc });
  } catch (error) {
    console.error(`STK status query failed for ${payment.checkout_request_id}:`, error);
    return null;
  }
}
