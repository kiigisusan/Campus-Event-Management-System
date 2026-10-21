/**
 * Booking engine: the core transaction of CEMS.
 *
 * CONCURRENCY RULE - read before changing anything here:
 * Every operation that changes a booking's status or an event's
 * spots_remaining first locks that event's row with SELECT ... FOR UPDATE,
 * inside a transaction, and only then reads and checks the current state.
 *
 *  - Two students racing for the last seat: the second one waits for the
 *    first transaction to finish, then sees spots_remaining = 0. The event can
 *    never be overbooked (and the CHECK constraint is a second safety net).
 *  - Booking, cancelling, the M-Pesa callback and the expiry job all take the
 *    same lock in the same order (event row first), so they cannot overwrite
 *    each other's changes and cannot deadlock.
 */
import { env } from '../config/env.js';
import { prisma } from '../config/prisma.js';
import { AUDIT_ACTIONS } from '../constants/auditActions.js';
import { ApiError } from '../utils/ApiError.js';
import { hasEventStarted } from '../utils/eventTime.js';
import { randomToken } from '../utils/tokens.js';
import { recordAudit } from './auditService.js';
import { queueBookingConfirmation } from './notificationService.js';

/** Statuses that count as holding a seat. */
export const ACTIVE_BOOKING_STATUSES = Object.freeze(['pending', 'confirmed', 'checked_in']);

/**
 * Options for every booking transaction. Under a booking rush requests queue
 * for the event lock, so allow more than Prisma's 2s/5s defaults.
 */
export const BOOKING_TX_OPTIONS = Object.freeze({ maxWait: 10_000, timeout: 15_000 });

/** Unguessable value encoded in the booking's QR code. */
export const newQrToken = () => randomToken(24);

/**
 * Locks an event row for the rest of the transaction.
 * Uses a tagged template, so `eventId` is sent as a bound parameter, not
 * concatenated into SQL.
 *
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 * @param {number} eventId
 * @returns {Promise<boolean>} false when the event does not exist
 */
export async function lockEvent(tx, eventId) {
  const rows =
    await tx.$queryRaw`SELECT event_id FROM events WHERE event_id = ${eventId} FOR UPDATE`;
  return rows.length > 0;
}

/** Fields of a booking and its event that are safe and useful to show the student. */
const BOOKING_INCLUDE = {
  event: {
    select: {
      event_id: true,
      title: true,
      event_date: true,
      event_time: true,
      price: true,
      status: true,
      image_url: true,
      venue: { select: { venue_id: true, name: true, location: true } },
    },
  },
  payment: {
    select: {
      status: true,
      amount: true,
      mpesa_receipt: true,
      phone_number: true,
      result_desc: true,
      transaction_date: true,
    },
  },
};

/**
 * Shapes a booking for the API. The QR token is only revealed once the
 * booking is confirmed: a pending (unpaid) booking must not get a usable ticket.
 */
export function presentBooking(booking) {
  const hasTicket = booking.status === 'confirmed' || booking.status === 'checked_in';
  return {
    booking_id: booking.booking_id,
    status: booking.status,
    booking_date: booking.booking_date,
    expires_at: booking.status === 'pending' ? booking.expires_at : null,
    checked_in_at: booking.checked_in_at,
    qr_code: hasTicket ? booking.qr_code : null,
    event: booking.event,
    payment: booking.payment ?? null,
  };
}

/**
 * Books a seat for a student.
 *
 * - Free event: booking is confirmed immediately.
 * - Paid event: booking is created as 'pending' and the seat is held for
 *   BOOKING_HOLD_MINUTES while the student pays (see paymentService).
 *
 * A student who previously cancelled (or whose payment expired) can book
 * again: the same row is re-used because of UNIQUE (student_id, event_id),
 * with a fresh QR token so the old ticket stops working.
 *
 * @param {{ studentId: number, eventId: number }} input
 * @param {{ ipAddress?: string }} context
 * @returns {Promise<object>} the presented booking
 */
export async function createBooking({ studentId, eventId }, { ipAddress } = {}) {
  const { bookingId, status } = await prisma.$transaction(async (tx) => {
    if (!(await lockEvent(tx, eventId))) {
      throw ApiError.notFound('Event not found', 'EVENT_NOT_FOUND');
    }
    const event = await tx.event.findUnique({ where: { event_id: eventId } });

    if (event.status !== 'approved') {
      throw ApiError.conflict('This event is not open for booking', 'EVENT_NOT_BOOKABLE');
    }
    if (hasEventStarted(event)) {
      throw ApiError.conflict('This event has already started', 'EVENT_STARTED');
    }

    const existing = await tx.booking.findUnique({
      where: { student_id_event_id: { student_id: studentId, event_id: eventId } },
    });
    if (existing && ACTIVE_BOOKING_STATUSES.includes(existing.status)) {
      throw ApiError.conflict(
        existing.status === 'pending'
          ? 'You already have a booking for this event waiting for payment'
          : 'You have already booked this event',
        'ALREADY_BOOKED',
      );
    }

    if (event.spots_remaining <= 0) {
      throw ApiError.conflict('Sorry, this event is fully booked', 'EVENT_FULL');
    }

    await tx.event.update({
      where: { event_id: eventId },
      data: { spots_remaining: { decrement: 1 } },
    });

    const isPaid = Number(event.price) > 0;
    const bookingData = {
      status: isPaid ? 'pending' : 'confirmed',
      qr_code: newQrToken(),
      booking_date: new Date(),
      expires_at: isPaid ? new Date(Date.now() + env.BOOKING_HOLD_MINUTES * 60_000) : null,
      checked_in_at: null,
    };

    const booking = existing
      ? await tx.booking.update({ where: { booking_id: existing.booking_id }, data: bookingData })
      : await tx.booking.create({
          data: { student_id: studentId, event_id: eventId, ...bookingData },
        });

    await recordAudit(
      {
        userId: studentId,
        action: AUDIT_ACTIONS.BOOKING_CREATED,
        targetType: 'booking',
        targetId: booking.booking_id,
        details: { event_id: eventId, status: booking.status },
        ipAddress,
      },
      { tx },
    );

    return { bookingId: booking.booking_id, status: booking.status };
  }, BOOKING_TX_OPTIONS);

  // Free events are confirmed now; paid ones are emailed when the payment succeeds.
  if (status === 'confirmed') queueBookingConfirmation(bookingId);

  return getBookingById(bookingId);
}

/**
 * Cancels a student's own booking and gives the seat back.
 *
 * Allowed while the booking is pending or confirmed and the event has not
 * started. M-Pesa refunds for paid bookings are handled manually by the
 * organizer; the response flags when one is due.
 *
 * @param {{ bookingId: number, studentId: number }} input
 * @param {{ ipAddress?: string }} context
 */
export async function cancelBooking({ bookingId, studentId }, { ipAddress } = {}) {
  // Read the event id first (no lock needed), then lock the event and re-read.
  const current = await prisma.booking.findUnique({ where: { booking_id: bookingId } });
  if (!current || current.student_id !== studentId) {
    throw ApiError.notFound('Booking not found', 'BOOKING_NOT_FOUND');
  }

  const refundDue = await prisma.$transaction(async (tx) => {
    await lockEvent(tx, current.event_id);
    const booking = await tx.booking.findUnique({
      where: { booking_id: bookingId },
      include: { event: true, payment: true },
    });

    if (!['pending', 'confirmed'].includes(booking.status)) {
      throw ApiError.conflict(
        booking.status === 'checked_in'
          ? 'You have already checked in to this event'
          : 'This booking is already cancelled',
        'BOOKING_NOT_CANCELLABLE',
      );
    }
    if (hasEventStarted(booking.event)) {
      throw ApiError.conflict(
        'Bookings cannot be cancelled after the event has started',
        'EVENT_STARTED',
      );
    }

    await tx.booking.update({
      where: { booking_id: bookingId },
      data: { status: 'cancelled', expires_at: null },
    });
    await tx.event.update({
      where: { event_id: booking.event_id },
      data: { spots_remaining: { increment: 1 } },
    });

    // An unpaid hold is simply abandoned; mark its payment attempt as failed.
    if (booking.payment?.status === 'pending') {
      await tx.payment.update({
        where: { payment_id: booking.payment.payment_id },
        data: { status: 'failed', result_desc: 'Booking cancelled by student before payment' },
      });
    }

    const paid = booking.payment?.status === 'completed';
    await recordAudit(
      {
        userId: studentId,
        action: AUDIT_ACTIONS.BOOKING_CANCELLED,
        targetType: 'booking',
        targetId: bookingId,
        details: { event_id: booking.event_id, previous_status: booking.status, refund_due: paid },
        ipAddress,
      },
      { tx },
    );
    return paid;
  }, BOOKING_TX_OPTIONS);

  return { booking: await getBookingById(bookingId), refundDue };
}

/**
 * @param {number} bookingId
 * @returns {Promise<object | null>} presented booking, or null if missing
 */
export async function getBookingById(bookingId) {
  const booking = await prisma.booking.findUnique({
    where: { booking_id: bookingId },
    include: BOOKING_INCLUDE,
  });
  return booking ? { ...presentBooking(booking), student_id: booking.student_id } : null;
}

/**
 * A student's bookings, latest event date first.
 *
 * @param {number} studentId
 * @param {{ page: number, pageSize: number, status?: string }} query
 */
export async function listStudentBookings(studentId, { page, pageSize, status }) {
  const where = { student_id: studentId, ...(status ? { status } : {}) };
  const [rows, total] = await prisma.$transaction([
    prisma.booking.findMany({
      where,
      include: BOOKING_INCLUDE,
      orderBy: [{ event: { event_date: 'desc' } }, { booking_id: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.booking.count({ where }),
  ]);
  return { bookings: rows.map(presentBooking), total };
}
