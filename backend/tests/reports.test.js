import request from 'supertest';
import { createApp } from '../src/app.js';
import { newQrToken } from '../src/services/bookingService.js';
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

/** Collects a binary response (PDF) into a Buffer. */
const binary = (res, callback) => {
  const chunks = [];
  res.on('data', (chunk) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
};

/**
 * Known dataset:
 *   Workshop:  "Intro Workshop"  (org1, free, in 3 days)  -> 2 bookings (1 checked in), 1 cancelled
 *              "Draft Workshop"  (org1, pending)           -> not counted in attendance
 *   Concert:   "Concert Night"   (org2, KES 200, in 40 days) -> 2 paid bookings, 1 unpaid hold
 *   Seminar:   no events                                  -> still listed, with zeros
 */
async function seedReportData() {
  const [workshop, concert, seminar] = await Promise.all(
    ['Workshop', 'Concert', 'Seminar'].map((name) => prisma.category.create({ data: { name } })),
  );
  const org1 = await createUser({ role: 'organizer', org_name: 'Tech Club' });
  const org2 = await createUser({ role: 'organizer', org_name: 'Music Society' });

  const intro = await createEvent({
    title: 'Intro Workshop',
    category_id: workshop.category_id,
    organizer_id: org1.user_id,
    event_date: daysFromToday(3),
    capacity: 10,
  });
  await createEvent({
    title: 'Draft Workshop',
    category_id: workshop.category_id,
    organizer_id: org1.user_id,
    status: 'pending',
  });
  const concertNight = await createEvent({
    title: 'Concert Night',
    category_id: concert.category_id,
    organizer_id: org2.user_id,
    event_date: daysFromToday(40),
    capacity: 5,
    price: 200,
  });

  const book = async (eventId, status, paid = false) => {
    const student = await createUser();
    const booking = await prisma.booking.create({
      data: { student_id: student.user_id, event_id: eventId, qr_code: newQrToken(), status },
    });
    if (paid) {
      await prisma.payment.create({
        data: {
          booking_id: booking.booking_id,
          amount: 200,
          phone_number: '254712345678',
          status: 'completed',
        },
      });
    }
  };
  await book(intro.event_id, 'checked_in');
  await book(intro.event_id, 'confirmed');
  await book(intro.event_id, 'cancelled');
  await book(concertNight.event_id, 'confirmed', true);
  await book(concertNight.event_id, 'confirmed', true);
  await book(concertNight.event_id, 'pending');

  return { workshop, concert, seminar, org1, org2 };
}

describeDb('reports', () => {
  let admin;
  let data;

  beforeAll(async () => {
    await resetDatabase();
    admin = await createUser({ role: 'admin', name: 'Grace Admin' });
    data = await seedReportData();
  });
  afterAll(closeDatabase);

  const get = (path) => request(app).get(`/api/v1/reports${path}`).set(asUser(admin));

  describe('attendance', () => {
    it('counts bookings, check-ins and revenue per approved event', async () => {
      const res = await get('/attendance');

      expect(res.status).toBe(200);
      expect(res.body.data.totals).toEqual({
        events: 2,
        bookings: 4,
        checked_in: 1,
        revenue: 400,
        attendance_rate: 25,
      });
      const intro = res.body.data.rows.find((r) => r.title === 'Intro Workshop');
      expect(intro).toMatchObject({
        bookings: 2,
        checked_in: 1,
        attendance_rate: 50,
        fill_rate: 20,
        revenue: 0,
        organizer: 'Tech Club',
      });
      expect(res.body.data.trend.length).toBeGreaterThanOrEqual(1);
    });

    it('sorts by the requested column', async () => {
      const byRevenue = await get('/attendance?sort=revenue&order=desc');
      expect(byRevenue.body.data.rows.map((r) => r.title)).toEqual([
        'Concert Night',
        'Intro Workshop',
      ]);

      const byDate = await get('/attendance?sort=date&order=asc');
      expect(byDate.body.data.rows[0].title).toBe('Intro Workshop');
    });

    it('filters by category and date range', async () => {
      const byCategory = await get(`/attendance?category_id=${data.concert.category_id}`);
      expect(byCategory.body.data.rows.map((r) => r.title)).toEqual(['Concert Night']);

      const to = daysFromToday(10).toISOString().slice(0, 10);
      const byDate = await get(`/attendance?to=${to}`);
      expect(byDate.body.data.rows.map((r) => r.title)).toEqual(['Intro Workshop']);
    });

    it('rejects invalid filters', async () => {
      expect((await get('/attendance?from=2026-12-01&to=2026-01-01')).status).toBe(400);
      expect((await get('/attendance?sort=password_hash')).status).toBe(400);
      expect((await get('/attendance?from=yesterday')).status).toBe(400);
    });
  });

  it('ranks categories by bookings, keeping categories with no events', async () => {
    const res = await get('/categories');

    const rows = res.body.data.rows;
    expect(rows.map((r) => r.category)).toEqual(['Concert', 'Workshop', 'Seminar']);
    expect(rows[0]).toMatchObject({ events: 1, bookings: 2, revenue: 400, share_of_bookings: 50 });
    expect(rows[2]).toMatchObject({ events: 0, bookings: 0, attendance_rate: null });
  });

  it("summarises each organizer's events by status, bookings and revenue", async () => {
    const res = await get('/organizers?sort=events&order=desc');

    const [first, second] = res.body.data.rows;
    expect(first).toMatchObject({
      organizer: 'Tech Club',
      events: 2,
      approved: 1,
      pending: 1,
      bookings: 2,
      checked_in: 1,
    });
    expect(second).toMatchObject({ organizer: 'Music Society', events: 1, revenue: 400 });
  });

  it('exports a PDF and records the export in the audit log', async () => {
    const res = await get(`/attendance/pdf?category_id=${data.workshop.category_id}`)
      .buffer(true)
      .parse(binary);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toMatch(
      /attachment; filename="cems-attendance-report-/,
    );
    expect(res.body.subarray(0, 5).toString()).toBe('%PDF-');

    const log = await prisma.auditLog.findFirst({ where: { action: 'EXPORT_REPORT' } });
    expect(log).toMatchObject({ user_id: admin.user_id, target_type: 'report' });
    expect(log.details).toMatchObject({ report: 'attendance', rows: 1 });
  });

  it('is only available to admins', async () => {
    const organizer = await createUser({ role: 'organizer' });
    const student = await createUser();

    for (const user of [organizer, student]) {
      const res = await request(app).get('/api/v1/reports/attendance').set(asUser(user));
      expect(res.status).toBe(403);
    }
  });
});
