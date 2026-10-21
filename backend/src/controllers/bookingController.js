/**
 * HTTP layer for /bookings.
 */
import * as bookingService from '../services/bookingService.js';
import { ApiError } from '../utils/ApiError.js';
import { paginationMeta, sendCreated, sendSuccess } from '../utils/response.js';

const contextOf = (req) => ({ ipAddress: req.ip });

export async function create(req, res) {
  const booking = await bookingService.createBooking(
    { studentId: req.user.user_id, eventId: req.validated.body.event_id },
    contextOf(req),
  );
  sendCreated(res, { booking });
}

export async function listMine(req, res) {
  const { page, pageSize, status } = req.validated.query;
  const { bookings, total } = await bookingService.listStudentBookings(req.user.user_id, {
    page,
    pageSize,
    status,
  });
  sendSuccess(res, { bookings }, { meta: paginationMeta({ page, pageSize, total }) });
}

/** A student sees their own bookings; admins can open any booking. */
export async function getById(req, res) {
  const booking = await bookingService.getBookingById(req.validated.params.id);
  const isOwner = booking?.student_id === req.user.user_id;
  if (!booking || (!isOwner && req.user.role !== 'admin')) {
    // 404 rather than 403, so ids of other students' bookings are not confirmed to exist.
    throw ApiError.notFound('Booking not found', 'BOOKING_NOT_FOUND');
  }
  const { student_id: _studentId, ...publicBooking } = booking;
  sendSuccess(res, { booking: publicBooking });
}

export async function cancel(req, res) {
  const { booking, refundDue } = await bookingService.cancelBooking(
    { bookingId: req.validated.params.id, studentId: req.user.user_id },
    contextOf(req),
  );
  const { student_id: _studentId, ...publicBooking } = booking;
  sendSuccess(res, {
    booking: publicBooking,
    message: refundDue
      ? 'Booking cancelled. The organizer will contact you about your M-Pesa refund.'
      : 'Booking cancelled.',
  });
}
