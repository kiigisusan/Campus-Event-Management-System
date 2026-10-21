import request from 'supertest';
import { createApp } from '../src/app.js';
import { newQrToken } from '../src/services/bookingService.js';
import { toQrPayload } from '../src/utils/qr.js';
import { signAccessToken } from '../src/utils/tokens.js';
import { createEvent, createUser, describeDb, prisma, resetDatabase } from './helpers/db.js';

const app = createApp();
const asUser = (user) => ({ Authorization: `Bearer ${signAccessToken(user)}` });

describeDb('QR tickets and check-in', () => {
  let organizer;
  let student;
  let event;

  /** A booking for `student` at `event` with the given status. */
  const createBooking = (status = 'confirmed', eventId = event.event_id) =>
    prisma.booking.create({
      data: { student_id: student.user_id, event_id: eventId, qr_code: newQrToken(), status },
    });

  const scan = (staff, qrText, eventId = event.event_id) =>
    request(app)
      .post('/api/v1/check-in')
      .set(asUser(staff))
      .send({ qr_code: qrText, event_id: eventId });

  beforeEach(async () => {
    await resetDatabase();
    organizer = await createUser({ role: 'organizer' });
    student = await createUser({ role: 'student', student_id_number: `S${Date.now()}` });
    event = await createEvent({ organizer_id: organizer.user_id });
  });
  afterAll(() => prisma.$disconnect());

  it('checks a student in and shows who it was', async () => {
    const booking = await createBooking();

    const res = await scan(organizer, toQrPayload(booking.qr_code));

    expect(res.status).toBe(200);
    expect(res.body.data.checkIn).toMatchObject({
      status: 'checked_in',
      student: { name: student.name, student_id_number: student.student_id_number },
    });
    const saved = await prisma.booking.findUnique({ where: { booking_id: booking.booking_id } });
    expect(saved.status).toBe('checked_in');
    expect(saved.checked_in_at).toBeInstanceOf(Date);
    expect(await prisma.auditLog.count({ where: { action: 'CHECK_IN' } })).toBe(1);
  });

  it('blocks a second scan of the same ticket and says when it was used', async () => {
    const booking = await createBooking();
    await scan(organizer, toQrPayload(booking.qr_code)).expect(200);

    const again = await scan(organizer, toQrPayload(booking.qr_code));

    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ALREADY_CHECKED_IN');
    expect(again.body.error.details.checked_in_at).toEqual(expect.any(String));
  });

  it('lets only one of two simultaneous scans succeed', async () => {
    const booking = await createBooking();
    const qr = toQrPayload(booking.qr_code);

    const results = await Promise.all([scan(organizer, qr), scan(organizer, qr)]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  });

  it('refuses unpaid, cancelled, unknown and non-CEMS codes', async () => {
    const unpaid = await createBooking('pending');
    expect((await scan(organizer, toQrPayload(unpaid.qr_code))).body.error.code).toBe('NOT_PAID');

    const otherEvent = await createEvent({ organizer_id: organizer.user_id });
    const cancelled = await createBooking('cancelled', otherEvent.event_id);
    const res = await scan(organizer, toQrPayload(cancelled.qr_code), otherEvent.event_id);
    expect(res.body.error.code).toBe('TICKET_CANCELLED');

    expect((await scan(organizer, toQrPayload(newQrToken()))).status).toBe(404);
    expect((await scan(organizer, 'https://example.com')).body.error.code).toBe('INVALID_TICKET');
  });

  it('refuses a ticket for a different event than the scanner is open for', async () => {
    const otherEvent = await createEvent({ organizer_id: organizer.user_id });
    const booking = await createBooking('confirmed', otherEvent.event_id);

    const res = await scan(organizer, toQrPayload(booking.qr_code), event.event_id);

    expect(res.body.error.code).toBe('WRONG_EVENT');
  });

  it("does not let an organizer check in to another organizer's event", async () => {
    const booking = await createBooking();
    const otherOrganizer = await createUser({ role: 'organizer' });

    const res = await scan(otherOrganizer, toQrPayload(booking.qr_code));

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NOT_YOUR_EVENT');
  });

  it('does not let students check anyone in', async () => {
    const booking = await createBooking();
    expect((await scan(student, toQrPayload(booking.qr_code))).status).toBe(403);
  });

  it('serves the ticket as a PNG only to its owner once confirmed', async () => {
    const booking = await createBooking();
    const pending = await createBooking('pending', (await createEvent()).event_id);

    const res = await request(app)
      .get(`/api/v1/bookings/${booking.booking_id}/qr`)
      .set(asUser(student));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.body.subarray(1, 4).toString()).toBe('PNG');

    const notYet = await request(app)
      .get(`/api/v1/bookings/${pending.booking_id}/qr`)
      .set(asUser(student));
    expect(notYet.body.error.code).toBe('NO_TICKET');

    const stranger = await request(app)
      .get(`/api/v1/bookings/${booking.booking_id}/qr`)
      .set(asUser(await createUser()));
    expect(stranger.status).toBe(404);
  });
});
