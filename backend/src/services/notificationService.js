/**
 * Emails sent to students about their bookings.
 *
 * These run in the background (see utils/background.js): a slow or broken
 * mail server must never delay or fail a booking, payment or cancellation.
 * Use the queue* functions from request code; the send* functions are the
 * underlying work and are exported for tests.
 */
import { env } from '../config/env.js';
import { prisma } from '../config/prisma.js';
import {
  QR_IMAGE_CID,
  bookingConfirmationEmail,
  eventCancelledEmail,
} from '../emails/templates.js';
import { runInBackground } from '../utils/background.js';
import { formatEventStart } from '../utils/eventTime.js';
import { qrPngBuffer } from '../utils/qr.js';
import { sendEmail } from './emailService.js';

/**
 * Master switch for notification emails (EMAIL_NOTIFICATIONS). Mutable so a
 * test suite can turn notifications on just for itself.
 */
export const notificationSettings = { enabled: env.EMAIL_NOTIFICATIONS };

/**
 * Emails the booking confirmation with the QR ticket attached.
 * Skips quietly if the booking is no longer confirmed by the time it runs.
 * @param {number} bookingId
 */
export async function sendBookingConfirmation(bookingId) {
  const booking = await prisma.booking.findUnique({
    where: { booking_id: bookingId },
    include: {
      student: { select: { name: true, email: true } },
      event: { include: { venue: true } },
      payment: true,
    },
  });
  if (!booking || booking.status !== 'confirmed') return;

  const { event } = booking;
  const paid = booking.payment?.status === 'completed';

  await sendEmail({
    to: booking.student.email,
    ...bookingConfirmationEmail({
      name: booking.student.name,
      bookingId: booking.booking_id,
      eventTitle: event.title,
      startsAt: formatEventStart(event),
      venue: `${event.venue.name}, ${event.venue.location}`,
      amountPaid: paid ? Number(booking.payment.amount) : undefined,
      mpesaReceipt: paid ? booking.payment.mpesa_receipt : undefined,
      ticketsUrl: `${env.CLIENT_URL}/my-bookings`,
    }),
    attachments: [
      {
        filename: `cems-ticket-${booking.booking_id}.png`,
        content: await qrPngBuffer(booking.qr_code),
        contentType: 'image/png',
        cid: QR_IMAGE_CID, // shown inline in the HTML, and downloadable
      },
    ],
  });
}

/** Sends the confirmation email after the current request, without waiting for it. */
export function queueBookingConfirmation(bookingId) {
  if (!notificationSettings.enabled) return;
  runInBackground(`booking confirmation #${bookingId}`, () => sendBookingConfirmation(bookingId));
}

/**
 * Emails everyone holding a booking (confirmed or awaiting payment) for an
 * event that has just been cancelled.
 *
 * Called by the event cancellation endpoint (Member 1) AFTER the event's
 * status has been set to 'cancelled'.
 *
 * @param {number} eventId
 * @param {{ reason?: string }} [options]
 * @returns {Promise<number>} how many students are being notified
 */
export async function notifyEventCancelled(eventId, { reason } = {}) {
  const event = await prisma.event.findUnique({
    where: { event_id: eventId },
    include: {
      organizer: { select: { name: true, org_name: true } },
      bookings: {
        where: { status: { in: ['pending', 'confirmed'] } },
        include: {
          student: { select: { name: true, email: true } },
          payment: { select: { status: true } },
        },
      },
    },
  });
  if (!event || !notificationSettings.enabled) return 0;

  const startsAt = formatEventStart(event);
  for (const booking of event.bookings) {
    runInBackground(`event cancelled notice #${booking.booking_id}`, () =>
      sendEmail({
        to: booking.student.email,
        ...eventCancelledEmail({
          name: booking.student.name,
          eventTitle: event.title,
          startsAt,
          reason,
          paid: booking.payment?.status === 'completed',
          organizerName: event.organizer.org_name ?? event.organizer.name,
        }),
      }),
    );
  }
  return event.bookings.length;
}
