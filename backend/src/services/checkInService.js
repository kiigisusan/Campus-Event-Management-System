/**
 * QR check-in at the venue (FR4).
 *
 * The organizer's scanner sends the text read from the student's QR code.
 * A ticket is accepted once: the status change from 'confirmed' to
 * 'checked_in' is a single conditional UPDATE, so even two scanners reading
 * the same ticket at the same moment cannot both succeed.
 */
import { prisma } from '../config/prisma.js';
import { AUDIT_ACTIONS } from '../constants/auditActions.js';
import { ApiError } from '../utils/ApiError.js';
import { parseQrPayload } from '../utils/qr.js';
import { recordAudit } from './auditService.js';

/** What the scanner screen shows after a scan. */
function presentCheckIn(booking) {
  return {
    booking_id: booking.booking_id,
    status: booking.status,
    checked_in_at: booking.checked_in_at,
    student: {
      name: booking.student.name,
      student_id_number: booking.student.student_id_number,
    },
    event: { event_id: booking.event.event_id, title: booking.event.title },
  };
}

/**
 * Validates a scanned ticket and marks the student as present.
 *
 * @param {{ scannedText: string, eventId?: number, staff: { user_id: number, role: string } }} input
 *   eventId: the event the scanner is open for; tickets for other events are refused.
 *   staff:   the organizer (must own the event) or admin doing the scan.
 * @param {{ ipAddress?: string }} context
 */
export async function checkIn({ scannedText, eventId, staff }, { ipAddress } = {}) {
  const token = parseQrPayload(scannedText);
  if (!token) {
    throw ApiError.badRequest('This is not a CEMS ticket', undefined, 'INVALID_TICKET');
  }

  const include = {
    student: { select: { name: true, student_id_number: true } },
    event: { select: { event_id: true, title: true, organizer_id: true, status: true } },
  };
  const booking = await prisma.booking.findUnique({ where: { qr_code: token }, include });
  if (!booking) {
    throw ApiError.notFound('Ticket not recognised', 'INVALID_TICKET');
  }

  const isOwner = booking.event.organizer_id === staff.user_id;
  if (!isOwner && staff.role !== 'admin') {
    throw ApiError.forbidden('This ticket is for an event you do not manage', 'NOT_YOUR_EVENT');
  }
  if (eventId && booking.event_id !== eventId) {
    throw ApiError.conflict(`This ticket is for "${booking.event.title}"`, 'WRONG_EVENT');
  }
  if (booking.event.status === 'cancelled') {
    throw ApiError.conflict('This event has been cancelled', 'EVENT_CANCELLED');
  }

  // Atomic: only succeeds if the ticket is still 'confirmed' at this instant.
  const checkedInAt = new Date();
  const { count } = await prisma.booking.updateMany({
    where: { booking_id: booking.booking_id, status: 'confirmed' },
    data: { status: 'checked_in', checked_in_at: checkedInAt },
  });

  if (count === 0) {
    const current = await prisma.booking.findUnique({
      where: { booking_id: booking.booking_id },
      include,
    });
    if (current.status === 'checked_in') {
      const error = ApiError.conflict('This ticket has already been used', 'ALREADY_CHECKED_IN');
      error.details = presentCheckIn(current); // scanner shows who and when
      throw error;
    }
    throw ApiError.conflict(
      current.status === 'pending'
        ? 'This booking has not been paid'
        : 'This booking was cancelled',
      current.status === 'pending' ? 'NOT_PAID' : 'TICKET_CANCELLED',
    );
  }

  await recordAudit({
    userId: staff.user_id,
    action: AUDIT_ACTIONS.CHECK_IN,
    targetType: 'booking',
    targetId: booking.booking_id,
    details: { event_id: booking.event_id, student_id: booking.student_id },
    ipAddress,
  });

  return presentCheckIn({ ...booking, status: 'checked_in', checked_in_at: checkedInAt });
}
