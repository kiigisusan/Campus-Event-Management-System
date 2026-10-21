import request from 'supertest';
import { createApp } from '../src/app.js';
import { signAccessToken } from '../src/utils/tokens.js';
import {
  createEvent,
  createUser,
  daysFromToday,
  describeDb,
  prisma,
  resetDatabase,
} from './helpers/db.js';

const app = createApp();

const asUser = (user) => ({ Authorization: `Bearer ${signAccessToken(user)}` });
const book = (user, eventId) =>
  request(app).post('/api/v1/bookings').set(asUser(user)).send({ event_id: eventId });
const cancel = (user, bookingId) =>
  request(app).patch(`/api/v1/bookings/${bookingId}/cancel`).set(asUser(user));
const spotsLeft = async (eventId) =>
  (await prisma.event.findUnique({ where: { event_id: eventId } })).spots_remaining;

describeDb('bookings', () => {
  let student;

  beforeEach(async () => {
    await resetDatabase();
    student = await createUser({ role: 'student' });
  });
  afterAll(() => prisma.$disconnect());

  describe('POST /bookings', () => {
    it('confirms a free event immediately and takes one seat', async () => {
      const event = await createEvent({ capacity: 10 });

      const res = await book(student, event.event_id);

      expect(res.status).toBe(201);
      expect(res.body.data.booking).toMatchObject({ status: 'confirmed', expires_at: null });
      expect(res.body.data.booking.qr_code).toEqual(expect.any(String));
      expect(await spotsLeft(event.event_id)).toBe(9);
      expect(await prisma.auditLog.count({ where: { action: 'BOOKING_CREATED' } })).toBe(1);
    });

    it('holds a seat as pending for a paid event, without a usable QR code yet', async () => {
      const event = await createEvent({ capacity: 10, price: 500 });

      const res = await book(student, event.event_id);

      expect(res.status).toBe(201);
      expect(res.body.data.booking.status).toBe('pending');
      expect(res.body.data.booking.qr_code).toBeNull();
      expect(new Date(res.body.data.booking.expires_at).getTime()).toBeGreaterThan(Date.now());
      expect(await spotsLeft(event.event_id)).toBe(9);
    });

    it('allows only one booking per student per event', async () => {
      const event = await createEvent();
      await book(student, event.event_id).expect(201);

      const res = await book(student, event.event_id);

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('ALREADY_BOOKED');
      expect(await spotsLeft(event.event_id)).toBe(49);
    });

    it('refuses a full event', async () => {
      const event = await createEvent({ capacity: 1 });
      await book(await createUser(), event.event_id).expect(201);

      const res = await book(student, event.event_id);

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('EVENT_FULL');
    });

    it('refuses events that are not approved or have already started', async () => {
      const pending = await createEvent({ status: 'pending' });
      const past = await createEvent({ event_date: daysFromToday(-1) });

      expect((await book(student, pending.event_id)).body.error.code).toBe('EVENT_NOT_BOOKABLE');
      expect((await book(student, past.event_id)).body.error.code).toBe('EVENT_STARTED');
      expect((await book(student, 999999)).status).toBe(404);
    });

    it('only lets students book', async () => {
      const event = await createEvent();
      const organizer = await createUser({ role: 'organizer' });

      expect((await book(organizer, event.event_id)).status).toBe(403);
    });

    it('never overbooks when many students book the last seats at the same time', async () => {
      const event = await createEvent({ capacity: 3 });
      const students = await Promise.all(Array.from({ length: 10 }, () => createUser()));

      const results = await Promise.all(students.map((s) => book(s, event.event_id)));

      const statuses = results.map((r) => r.status).sort();
      expect(statuses.filter((s) => s === 201)).toHaveLength(3);
      expect(statuses.filter((s) => s === 409)).toHaveLength(7);
      expect(await spotsLeft(event.event_id)).toBe(0);
      expect(await prisma.booking.count({ where: { event_id: event.event_id } })).toBe(3);
    });
  });

  describe('PATCH /bookings/:id/cancel', () => {
    it('cancels the booking and gives the seat back', async () => {
      const event = await createEvent({ capacity: 5 });
      const { booking_id } = (await book(student, event.event_id)).body.data.booking;

      const res = await cancel(student, booking_id);

      expect(res.status).toBe(200);
      expect(res.body.data.booking.status).toBe('cancelled');
      expect(res.body.data.booking.qr_code).toBeNull();
      expect(await spotsLeft(event.event_id)).toBe(5);
      expect((await cancel(student, booking_id)).body.error.code).toBe('BOOKING_NOT_CANCELLABLE');
    });

    it('lets the student book again after cancelling, with a new QR code', async () => {
      const event = await createEvent();
      const first = (await book(student, event.event_id)).body.data.booking;
      await cancel(student, first.booking_id).expect(200);

      const again = await book(student, event.event_id);

      expect(again.status).toBe(201);
      expect(again.body.data.booking.booking_id).toBe(first.booking_id);
      expect(again.body.data.booking.qr_code).not.toBe(first.qr_code);
      expect(await spotsLeft(event.event_id)).toBe(49);
    });

    it("does not let a student see or cancel someone else's booking", async () => {
      const event = await createEvent();
      const { booking_id } = (await book(student, event.event_id)).body.data.booking;
      const other = await createUser();

      expect((await cancel(other, booking_id)).status).toBe(404);
      const view = await request(app).get(`/api/v1/bookings/${booking_id}`).set(asUser(other));
      expect(view.status).toBe(404);
    });
  });

  describe('GET /bookings/me', () => {
    it("lists only the student's own bookings with pagination", async () => {
      const [a, b] = [await createEvent(), await createEvent()];
      await book(student, a.event_id);
      await book(student, b.event_id);
      await book(await createUser(), a.event_id);

      const res = await request(app).get('/api/v1/bookings/me?pageSize=1').set(asUser(student));

      expect(res.status).toBe(200);
      expect(res.body.data.bookings).toHaveLength(1);
      expect(res.body.meta).toMatchObject({ page: 1, pageSize: 1, total: 2, totalPages: 2 });
      expect(res.body.data.bookings[0].event.venue.name).toEqual(expect.any(String));
    });
  });
});
