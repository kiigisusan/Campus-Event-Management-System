import request from 'supertest';
import { createApp } from '../src/app.js';
import { signAccessToken } from '../src/utils/tokens.js';
import { closeDatabase, createUser, describeDb, prisma, resetDatabase } from './helpers/db.js';

const app = createApp();
const asUser = (user) => ({ Authorization: `Bearer ${signAccessToken(user)}` });

const binary = (res, callback) => {
  const chunks = [];
  res.on('data', (chunk) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
};

describeDb('audit log API', () => {
  let admin;
  let grace;
  let kevin;

  beforeAll(async () => {
    await resetDatabase();
    admin = await createUser({ role: 'admin', name: 'Admin User' });
    grace = await createUser({ role: 'admin', name: 'Grace Wanjiku', email: 'grace@cems.test' });
    kevin = await createUser({ role: 'student', name: 'Kevin Mwangi', email: 'kevin@cems.test' });

    await prisma.auditLog.createMany({
      data: [
        // 21 Oct 23:00 in Nairobi (20:00 UTC)
        {
          user_id: kevin.user_id,
          action: 'LOGIN_SUCCESS',
          target_type: 'user',
          target_id: kevin.user_id,
          timestamp: new Date('2026-10-21T20:00:00Z'),
        },
        // 22 Oct 01:00 in Nairobi (21 Oct 22:00 UTC) - a different Kenyan day
        {
          user_id: grace.user_id,
          action: 'APPROVE_EVENT',
          target_type: 'event',
          target_id: 5,
          timestamp: new Date('2026-10-21T22:00:00Z'),
        },
        {
          user_id: grace.user_id,
          action: 'REJECT_EVENT',
          target_type: 'event',
          target_id: 6,
          details: { reason: 'Clash' },
          timestamp: new Date('2026-10-22T09:00:00Z'),
        },
        // System action: no user
        {
          user_id: null,
          action: 'BOOKING_EXPIRED',
          target_type: 'booking',
          target_id: 9,
          timestamp: new Date('2026-10-23T09:00:00Z'),
        },
      ],
    });
  });
  afterAll(closeDatabase);

  const get = (query = '') => request(app).get(`/api/v1/audit-logs${query}`).set(asUser(admin));

  it('lists entries newest first with the acting user and pagination', async () => {
    const res = await get('?pageSize=2');

    expect(res.status).toBe(200);
    expect(res.body.data.logs.map((l) => l.action)).toEqual(['BOOKING_EXPIRED', 'REJECT_EVENT']);
    expect(res.body.data.logs[0].user).toBeNull(); // system action
    expect(res.body.data.logs[1].user).toMatchObject({ name: 'Grace Wanjiku', role: 'admin' });
    expect(res.body.data.logs[1].details).toEqual({ reason: 'Clash' });
    expect(res.body.meta).toMatchObject({ total: 4, totalPages: 2 });
  });

  it('filters by action, user and target type', async () => {
    expect((await get('?action=APPROVE_EVENT')).body.data.logs).toHaveLength(1);
    expect((await get(`?user_id=${grace.user_id}`)).body.data.logs).toHaveLength(2);
    expect((await get('?target_type=booking')).body.data.logs).toHaveLength(1);
  });

  it("searches the acting user's name or email, ignoring case", async () => {
    expect((await get('?search=KEVIN')).body.data.logs.map((l) => l.action)).toEqual([
      'LOGIN_SUCCESS',
    ]);
    expect((await get('?search=grace@cems')).body.data.logs).toHaveLength(2);
  });

  it('filters by Kenyan calendar day', async () => {
    const res = await get('?from=2026-10-22&to=2026-10-22');

    expect(res.body.data.logs.map((l) => l.action).sort()).toEqual([
      'APPROVE_EVENT',
      'REJECT_EVENT',
    ]);
  });

  it('can list oldest first', async () => {
    const res = await get('?order=asc&pageSize=1');
    expect(res.body.data.logs[0].action).toBe('LOGIN_SUCCESS');
  });

  it('rejects unknown actions and bad date ranges', async () => {
    expect((await get('?action=DROP_TABLE')).status).toBe(400);
    expect((await get('?from=2026-10-23&to=2026-10-01')).status).toBe(400);
  });

  it('lists the action names for the filter dropdown', async () => {
    const res = await request(app).get('/api/v1/audit-logs/actions').set(asUser(admin));
    expect(res.body.data.actions).toEqual(expect.arrayContaining(['LOGIN_SUCCESS', 'CHECK_IN']));
  });

  it('exports the filtered log as a PDF', async () => {
    const res = await request(app)
      .get('/api/v1/audit-logs/pdf?target_type=event')
      .set(asUser(admin))
      .buffer(true)
      .parse(binary);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.body.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('is only available to admins', async () => {
    const res = await request(app).get('/api/v1/audit-logs').set(asUser(kevin));
    expect(res.status).toBe(403);
  });
});
