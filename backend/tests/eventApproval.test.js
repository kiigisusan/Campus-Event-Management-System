import request from 'supertest';
import { createApp } from '../src/app.js';
import { signAccessToken } from '../src/utils/tokens.js';
import {
  closeDatabase,
  createEvent,
  createUser,
  describeDb,
  prisma,
  resetDatabase,
} from './helpers/db.js';

const app = createApp();
const asUser = (user) => ({ Authorization: `Bearer ${signAccessToken(user)}` });

async function auditCount(action) {
  for (let i = 0; i < 20; i += 1) {
    const count = await prisma.auditLog.count({ where: { action } });
    if (count > 0) return count;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return 0;
}

describeDb('Admin event approval', () => {
  let admin;
  let organizer;
  let student;

  beforeEach(async () => {
    await resetDatabase();
    admin = await createUser({ role: 'admin' });
    organizer = await createUser({ role: 'organizer', org_name: 'Club' });
    student = await createUser({ role: 'student', student_id_number: `S${Date.now()}` });
  });
  afterAll(closeDatabase);

  it('shows pending events in the queue, oldest first, with organizer details', async () => {
    const first = await createEvent({ status: 'pending', organizer_id: organizer.user_id });
    await createEvent({ status: 'approved' });
    const second = await createEvent({ status: 'pending' });
    await prisma.event.update({
      where: { event_id: second.event_id },
      data: { updated_at: new Date(Date.now() + 60_000) },
    });

    const res = await request(app).get('/api/v1/admin/events').set(asUser(admin));

    expect(res.status).toBe(200);
    expect(res.body.data.events.map((e) => e.event_id)).toEqual([
      first.event_id,
      second.event_id,
    ]);
    expect(res.body.data.events[0].organizer).toMatchObject({ org_name: 'Club' });
  });

  it('can show other statuses with ?status=', async () => {
    await createEvent({ status: 'pending' });
    const rejected = await createEvent({ status: 'rejected' });

    const res = await request(app).get('/api/v1/admin/events?status=rejected').set(asUser(admin));

    expect(res.body.data.events.map((e) => e.event_id)).toEqual([rejected.event_id]);
  });

  it('keeps the queue away from visitors, students and organizers', async () => {
    expect((await request(app).get('/api/v1/admin/events')).status).toBe(401);
    expect((await request(app).get('/api/v1/admin/events').set(asUser(student))).status).toBe(403);
    expect((await request(app).get('/api/v1/admin/events').set(asUser(organizer))).status).toBe(
      403,
    );
  });

  it('approves a pending event so it appears in the public list', async () => {
    const event = await createEvent({ status: 'pending' });

    const res = await request(app)
      .patch(`/api/v1/admin/events/${event.event_id}/approve`)
      .set(asUser(admin));

    expect(res.status).toBe(200);
    expect(res.body.data.event.status).toBe('approved');
    expect(await auditCount('APPROVE_EVENT')).toBe(1);

    const list = await request(app).get('/api/v1/events');
    expect(list.body.data.events.map((e) => e.event_id)).toContain(event.event_id);
  });

  it('rejects with a reason the organizer can read, and logs the reason', async () => {
    const event = await createEvent({ status: 'pending', organizer_id: organizer.user_id });

    const res = await request(app)
      .patch(`/api/v1/admin/events/${event.event_id}/reject`)
      .set(asUser(admin))
      .send({ reason: 'Please add a safety plan.' });

    expect(res.status).toBe(200);
    expect(res.body.data.event).toMatchObject({
      status: 'rejected',
      rejection_reason: 'Please add a safety plan.',
    });
    expect(await auditCount('REJECT_EVENT')).toBe(1);

    const seenByOrganizer = await request(app)
      .get(`/api/v1/events/${event.event_id}`)
      .set(asUser(organizer));
    expect(seenByOrganizer.body.data.event.rejection_reason).toBe('Please add a safety plan.');
  });

  it('requires a reason to reject', async () => {
    const event = await createEvent({ status: 'pending' });

    const res = await request(app)
      .patch(`/api/v1/admin/events/${event.event_id}/reject`)
      .set(asUser(admin))
      .send({ reason: 'no' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('only reviews pending events', async () => {
    const approved = await createEvent({ status: 'approved' });
    const draft = await createEvent({ status: 'draft' });

    const again = await request(app)
      .patch(`/api/v1/admin/events/${approved.event_id}/approve`)
      .set(asUser(admin));
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('NOT_PENDING');

    const notSubmitted = await request(app)
      .patch(`/api/v1/admin/events/${draft.event_id}/reject`)
      .set(asUser(admin))
      .send({ reason: 'Not ready yet.' });
    expect(notSubmitted.status).toBe(409);
  });

  it('returns 404 for an event that does not exist', async () => {
    const res = await request(app)
      .patch('/api/v1/admin/events/999999/approve')
      .set(asUser(admin));

    expect(res.status).toBe(404);
  });

  it('does not let students or organizers approve', async () => {
    const event = await createEvent({ status: 'pending', organizer_id: organizer.user_id });
    const url = `/api/v1/admin/events/${event.event_id}/approve`;

    expect((await request(app).patch(url).set(asUser(student))).status).toBe(403);
    expect((await request(app).patch(url).set(asUser(organizer))).status).toBe(403);

    const saved = await prisma.event.findUnique({ where: { event_id: event.event_id } });
    expect(saved.status).toBe('pending');
  });

  it('lets only one of two simultaneous reviews succeed', async () => {
    const event = await createEvent({ status: 'pending' });
    const secondAdmin = await createUser({ role: 'admin' });
    const url = `/api/v1/admin/events/${event.event_id}/approve`;

    const results = await Promise.all([
      request(app).patch(url).set(asUser(admin)),
      request(app).patch(url).set(asUser(secondAdmin)),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  });

  it('lets an organizer fix a rejected event and approves it on resubmission', async () => {
    const event = await createEvent({ status: 'pending', organizer_id: organizer.user_id });
    await request(app)
      .patch(`/api/v1/admin/events/${event.event_id}/reject`)
      .set(asUser(admin))
      .send({ reason: 'Add a safety plan.' })
      .expect(200);

    await request(app)
      .patch(`/api/v1/events/${event.event_id}`)
      .set(asUser(organizer))
      .send({ description: 'Updated description including the safety plan.' })
      .expect(200);
    await request(app)
      .patch(`/api/v1/events/${event.event_id}/submit`)
      .set(asUser(organizer))
      .expect(200);
    const approved = await request(app)
      .patch(`/api/v1/admin/events/${event.event_id}/approve`)
      .set(asUser(admin));

    expect(approved.status).toBe(200);
    expect(approved.body.data.event.status).toBe('approved');
  });
});