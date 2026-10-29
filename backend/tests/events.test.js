import request from 'supertest';
import { createApp } from '../src/app.js';
import { signAccessToken } from '../src/utils/tokens.js';
import {
  closeDatabase,
  createEvent,
  createUser,
  daysFromToday,
  describeDb,
  prisma,
  resetDatabase,
} from './helpers/db.js';

const app = createApp();
const asUser = (user) => ({ Authorization: `Bearer ${signAccessToken(user)}` });
const isoDay = (days) => daysFromToday(days).toISOString().slice(0, 10);

/** The audit entry is written just after the response, so wait briefly for it. */
async function auditCount(action) {
  for (let i = 0; i < 20; i += 1) {
    const count = await prisma.auditLog.count({ where: { action } });
    if (count > 0) return count;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return 0;
}

describeDb('Events API', () => {
  let organizer;
  let otherOrganizer;
  let student;
  let admin;
  let venue;
  let category;

  const newEventBody = (overrides = {}) => ({
    title: 'Test Workshop',
    description: 'A hands-on test workshop.',
    event_date: isoDay(10),
    event_time: '14:00',
    venue_id: venue.venue_id,
    capacity: 50,
    price: 0,
    category_id: category.category_id,
    ...overrides,
  });

  beforeEach(async () => {
    await resetDatabase();
    organizer = await createUser({ role: 'organizer', org_name: 'Club A' });
    otherOrganizer = await createUser({ role: 'organizer', org_name: 'Club B' });
    student = await createUser({ role: 'student', student_id_number: `S${Date.now()}` });
    admin = await createUser({ role: 'admin' });
    venue = await prisma.venue.create({
      data: { name: 'Test Hall', location: 'Block A', capacity: 100 },
    });
    category = await prisma.category.create({ data: { name: `Workshop ${Date.now()}` } });
  });
  afterAll(closeDatabase);

  describe('browsing', () => {
    it('lists only approved events to the public', async () => {
      const approved = await createEvent({ status: 'approved' });
      await createEvent({ status: 'pending' });
      await createEvent({ status: 'draft' });
      await createEvent({ status: 'rejected' });
      await createEvent({ status: 'cancelled' });

      const res = await request(app).get('/api/v1/events');

      expect(res.status).toBe(200);
      expect(res.body.data.events.map((e) => e.event_id)).toEqual([approved.event_id]);
      expect(res.body.meta.total).toBe(1);
    });

    it('hides events that have already passed', async () => {
      await createEvent({ event_date: daysFromToday(-3) });
      const upcoming = await createEvent();

      const res = await request(app).get('/api/v1/events');

      expect(res.body.data.events.map((e) => e.event_id)).toEqual([upcoming.event_id]);
    });

    it('searches by title and filters by free or paid', async () => {
      const zebra = await createEvent({ title: 'Zebra Hackathon', price: 0 });
      const paid = await createEvent({ title: 'Gala Dinner', price: 500 });

      const search = await request(app).get('/api/v1/events?search=zebra');
      expect(search.body.data.events.map((e) => e.event_id)).toEqual([zebra.event_id]);

      const onlyPaid = await request(app).get('/api/v1/events?free=false');
      expect(onlyPaid.body.data.events.map((e) => e.event_id)).toEqual([paid.event_id]);
    });

    it('filters by category', async () => {
      const wanted = await createEvent();
      await createEvent();

      const res = await request(app).get(`/api/v1/events?category_id=${wanted.category_id}`);

      expect(res.body.data.events.map((e) => e.event_id)).toEqual([wanted.event_id]);
    });

    it('shows an approved event to anyone, with date, time and price formatted', async () => {
      const event = await createEvent({ price: 250 });

      const res = await request(app).get(`/api/v1/events/${event.event_id}`);

      expect(res.status).toBe(200);
      expect(res.body.data.event).toMatchObject({
        event_id: event.event_id,
        event_time: '14:00',
        price: 250,
      });
      expect(res.body.data.event.event_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('hides a draft from the public but shows it to its owner and to admins', async () => {
      const draft = await createEvent({ status: 'draft', organizer_id: organizer.user_id });
      const url = `/api/v1/events/${draft.event_id}`;

      expect((await request(app).get(url)).status).toBe(404);
      expect((await request(app).get(url).set(asUser(student))).status).toBe(404);
      expect((await request(app).get(url).set(asUser(otherOrganizer))).status).toBe(404);
      expect((await request(app).get(url).set(asUser(organizer))).status).toBe(200);
      expect((await request(app).get(url).set(asUser(admin))).status).toBe(200);
    });

    it("lists an organizer's own events in every status", async () => {
      await createEvent({ status: 'draft', organizer_id: organizer.user_id });
      await createEvent({ status: 'pending', organizer_id: organizer.user_id });
      await createEvent({ organizer_id: otherOrganizer.user_id });

      const res = await request(app).get('/api/v1/events/mine').set(asUser(organizer));

      expect(res.status).toBe(200);
      expect(res.body.data.events).toHaveLength(2);
    });

    it('does not let students use /events/mine', async () => {
      const res = await request(app).get('/api/v1/events/mine').set(asUser(student));
      expect(res.status).toBe(403);
    });
  });

  describe('creating', () => {
    it('creates a draft with all spots free and records it in the audit log', async () => {
      const res = await request(app)
        .post('/api/v1/events')
        .set(asUser(organizer))
        .send(newEventBody());

      expect(res.status).toBe(201);
      expect(res.body.data.event).toMatchObject({
        status: 'draft',
        capacity: 50,
        spots_remaining: 50,
        organizer_id: organizer.user_id,
      });
      expect(await auditCount('CREATE_EVENT')).toBe(1);
    });

    it('does not let students or visitors create events', async () => {
      expect(
        (await request(app).post('/api/v1/events').set(asUser(student)).send(newEventBody()))
          .status,
      ).toBe(403);
      expect((await request(app).post('/api/v1/events').send(newEventBody())).status).toBe(401);
    });

    it('rejects bad input with field errors', async () => {
      const res = await request(app)
        .post('/api/v1/events')
        .set(asUser(organizer))
        .send(newEventBody({ title: 'x', capacity: 0, event_time: '25:99' }));

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('refuses events in the past', async () => {
      const res = await request(app)
        .post('/api/v1/events')
        .set(asUser(organizer))
        .send(newEventBody({ event_date: isoDay(-1) }));

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('EVENT_IN_PAST');
    });

    it('refuses a capacity bigger than the venue', async () => {
      const res = await request(app)
        .post('/api/v1/events')
        .set(asUser(organizer))
        .send(newEventBody({ capacity: 200 }));

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('CAPACITY_EXCEEDS_VENUE');
    });

    it('refuses a venue or category that does not exist', async () => {
      const badVenue = await request(app)
        .post('/api/v1/events')
        .set(asUser(organizer))
        .send(newEventBody({ venue_id: 999999 }));
      expect(badVenue.body.error.code).toBe('VENUE_NOT_FOUND');

      const badCategory = await request(app)
        .post('/api/v1/events')
        .set(asUser(organizer))
        .send(newEventBody({ category_id: 999999 }));
      expect(badCategory.body.error.code).toBe('CATEGORY_NOT_FOUND');
    });
  });

  describe('editing', () => {
    it('lets the owner edit and nobody else', async () => {
      const event = await createEvent({ status: 'draft', organizer_id: organizer.user_id });
      const url = `/api/v1/events/${event.event_id}`;

      const ok = await request(app).patch(url).set(asUser(organizer)).send({ title: 'New title' });
      expect(ok.status).toBe(200);
      expect(ok.body.data.event.title).toBe('New title');

      const stranger = await request(app)
        .patch(url)
        .set(asUser(otherOrganizer))
        .send({ title: 'Hijacked' });
      expect(stranger.status).toBe(404);
    });

    it('refuses an empty edit', async () => {
      const event = await createEvent({ status: 'draft', organizer_id: organizer.user_id });

      const res = await request(app)
        .patch(`/api/v1/events/${event.event_id}`)
        .set(asUser(organizer))
        .send({});

      expect(res.status).toBe(400);
    });

    it('locks date, time, venue and price once students have booked', async () => {
      const event = await createEvent({
        organizer_id: organizer.user_id,
        capacity: 10,
        spots_remaining: 7, // 3 seats taken
      });
      const url = `/api/v1/events/${event.event_id}`;

      const res = await request(app)
        .patch(url)
        .set(asUser(organizer))
        .send({ event_date: isoDay(20) });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('EVENT_HAS_BOOKINGS');

      const titleOnly = await request(app)
        .patch(url)
        .set(asUser(organizer))
        .send({ title: 'Renamed' });
      expect(titleOnly.status).toBe(200);
    });

    it('does not let capacity drop below the seats already booked', async () => {
      const event = await createEvent({
        organizer_id: organizer.user_id,
        capacity: 10,
        spots_remaining: 5, // 5 seats taken
      });

      const res = await request(app)
        .patch(`/api/v1/events/${event.event_id}`)
        .set(asUser(organizer))
        .send({ capacity: 3 });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CAPACITY_BELOW_BOOKINGS');
    });

    it('keeps the booked seats when capacity grows', async () => {
      const event = await createEvent({
        organizer_id: organizer.user_id,
        capacity: 10,
        spots_remaining: 5,
      });

      const res = await request(app)
        .patch(`/api/v1/events/${event.event_id}`)
        .set(asUser(organizer))
        .send({ capacity: 20 });

      expect(res.status).toBe(200);
      expect(res.body.data.event).toMatchObject({ capacity: 20, spots_remaining: 15 });
    });

    it('moves a rejected event back to draft when it is edited', async () => {
      const event = await createEvent({
        status: 'rejected',
        rejection_reason: 'Add a safety plan',
        organizer_id: organizer.user_id,
      });

      const res = await request(app)
        .patch(`/api/v1/events/${event.event_id}`)
        .set(asUser(organizer))
        .send({ description: 'Now with a full safety plan attached.' });

      expect(res.status).toBe(200);
      expect(res.body.data.event).toMatchObject({ status: 'draft', rejection_reason: null });
    });

    it('does not allow editing a cancelled event', async () => {
      const event = await createEvent({ status: 'cancelled', organizer_id: organizer.user_id });

      const res = await request(app)
        .patch(`/api/v1/events/${event.event_id}`)
        .set(asUser(organizer))
        .send({ title: 'Too late' });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('EVENT_CANCELLED');
    });
  });

  describe('submitting for approval', () => {
    it('moves a draft to pending', async () => {
      const event = await createEvent({ status: 'draft', organizer_id: organizer.user_id });

      const res = await request(app)
        .patch(`/api/v1/events/${event.event_id}/submit`)
        .set(asUser(organizer));

      expect(res.status).toBe(200);
      expect(res.body.data.event.status).toBe('pending');
      expect(await auditCount('SUBMIT_EVENT')).toBe(1);
    });

    it('only accepts drafts', async () => {
      const approved = await createEvent({ organizer_id: organizer.user_id });

      const res = await request(app)
        .patch(`/api/v1/events/${approved.event_id}/submit`)
        .set(asUser(organizer));

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('NOT_A_DRAFT');
    });

    it("does not let another organizer submit someone else's event", async () => {
      const event = await createEvent({ status: 'draft', organizer_id: organizer.user_id });

      const res = await request(app)
        .patch(`/api/v1/events/${event.event_id}/submit`)
        .set(asUser(otherOrganizer));

      expect(res.status).toBe(404);
    });
  });

  describe('cancelling', () => {
    it('lets the owner cancel an approved event', async () => {
      const event = await createEvent({ organizer_id: organizer.user_id });

      const res = await request(app)
        .patch(`/api/v1/events/${event.event_id}/cancel`)
        .set(asUser(organizer))
        .send({ reason: 'Speaker is unwell' });

      expect(res.status).toBe(200);
      expect(res.body.data.event.status).toBe('cancelled');
      expect(await auditCount('CANCEL_EVENT')).toBe(1);
    });

    it('lets an admin cancel any event', async () => {
      const event = await createEvent({ organizer_id: organizer.user_id });

      const res = await request(app)
        .patch(`/api/v1/events/${event.event_id}/cancel`)
        .set(asUser(admin))
        .send({});

      expect(res.status).toBe(200);
    });

    it('does not let another organizer or a student cancel it', async () => {
      const event = await createEvent({ organizer_id: organizer.user_id });
      const url = `/api/v1/events/${event.event_id}/cancel`;

      expect((await request(app).patch(url).set(asUser(otherOrganizer)).send({})).status).toBe(404);
      expect((await request(app).patch(url).set(asUser(student)).send({})).status).toBe(403);
    });

    it('cannot cancel twice', async () => {
      const event = await createEvent({ organizer_id: organizer.user_id });
      const url = `/api/v1/events/${event.event_id}/cancel`;
      await request(app).patch(url).set(asUser(organizer)).send({}).expect(200);

      const again = await request(app).patch(url).set(asUser(organizer)).send({});

      expect(again.status).toBe(409);
      expect(again.body.error.code).toBe('CANNOT_CANCEL');
    });

    it('does not allow cancelling an event that has already started', async () => {
      const event = await createEvent({
        organizer_id: organizer.user_id,
        event_date: daysFromToday(-1),
      });

      const res = await request(app)
        .patch(`/api/v1/events/${event.event_id}/cancel`)
        .set(asUser(organizer))
        .send({});

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('EVENT_STARTED');
    });
  });
});