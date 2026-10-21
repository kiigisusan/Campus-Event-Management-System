/**
 * Recovery job: releases seats held by unpaid bookings.
 *
 * A paid booking holds a seat as 'pending' until BOOKING_HOLD_MINUTES pass.
 * If the student never pays (closed the app, phone off, payment failed and
 * no retry), this job cancels the booking and gives the seat back, so an
 * abandoned or failed payment can never block a seat for long (NFR3).
 *
 * Before expiring a booking whose payment is still marked 'pending', it asks
 * Safaricom for the result, in case the callback was lost and the student did
 * in fact pay. A payment that arrives after expiry is still handled safely by
 * paymentService.applyPaymentResult (seat re-taken or refund flagged).
 */
import { prisma } from '../config/prisma.js';
import { AUDIT_ACTIONS } from '../constants/auditActions.js';
import { recordAudit } from '../services/auditService.js';
import { BOOKING_TX_OPTIONS, lockEvent } from '../services/bookingService.js';
import { reconcilePayment } from '../services/paymentService.js';

const BATCH_SIZE = 100;

/**
 * Expires every pending booking whose hold has run out.
 * Safe to run concurrently or repeatedly: each booking is re-checked under
 * the event lock, so it is only ever expired once.
 *
 * @param {{ now?: Date }} [options]
 * @returns {Promise<{ expired: number }>}
 */
export async function expirePendingBookings({ now = new Date() } = {}) {
  const due = await prisma.booking.findMany({
    where: { status: 'pending', expires_at: { lte: now } },
    select: {
      booking_id: true,
      event_id: true,
      payment: { select: { status: true, checkout_request_id: true } },
    },
    orderBy: { expires_at: 'asc' },
    take: BATCH_SIZE,
  });

  let expired = 0;
  for (const candidate of due) {
    // Last chance: the student may have paid and only the callback was lost.
    if (candidate.payment?.status === 'pending') {
      await reconcilePayment(candidate.payment);
    }

    const didExpire = await prisma.$transaction(async (tx) => {
      await lockEvent(tx, candidate.event_id);
      const booking = await tx.booking.findUnique({
        where: { booking_id: candidate.booking_id },
        include: { payment: true },
      });

      // Paid, cancelled or extended since we looked: leave it alone.
      if (booking.status !== 'pending' || !booking.expires_at || booking.expires_at > now) {
        return false;
      }

      await tx.booking.update({
        where: { booking_id: booking.booking_id },
        data: { status: 'cancelled', expires_at: null },
      });
      await tx.event.update({
        where: { event_id: booking.event_id },
        data: { spots_remaining: { increment: 1 } },
      });
      if (booking.payment?.status === 'pending') {
        await tx.payment.update({
          where: { payment_id: booking.payment.payment_id },
          data: { status: 'failed', result_desc: 'Payment was not completed in time' },
        });
      }
      await recordAudit(
        {
          userId: null, // system action
          action: AUDIT_ACTIONS.BOOKING_EXPIRED,
          targetType: 'booking',
          targetId: booking.booking_id,
          details: { student_id: booking.student_id, event_id: booking.event_id },
        },
        { tx },
      );
      return true;
    }, BOOKING_TX_OPTIONS);

    if (didExpire) expired += 1;
  }

  return { expired };
}

/**
 * Runs the job now and then every `intervalMs`. Skips a tick if the previous
 * run is still going. Returns a function that stops the job.
 *
 * @param {{ intervalMs?: number }} [options]
 * @returns {() => void}
 */
export function startBookingExpiryJob({ intervalMs = 60_000 } = {}) {
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const { expired } = await expirePendingBookings();
      if (expired > 0) console.log(`Released ${expired} unpaid booking hold(s)`);
    } catch (error) {
      console.error('Booking expiry job failed:', error);
    } finally {
      running = false;
    }
  };

  const timer = setInterval(tick, intervalMs);
  timer.unref(); // never keeps the process alive on its own
  tick();
  return () => clearInterval(timer);
}
