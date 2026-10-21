import express from 'express';
import request from 'supertest';
import { AUDIT_ACTIONS } from '../src/constants/auditActions.js';
import { audit } from '../src/middleware/audit.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { recordAudit } from '../src/services/auditService.js';
import { ApiError } from '../src/utils/ApiError.js';
import { createUser, describeDb, prisma, resetDatabase } from './helpers/db.js';

/** The middleware writes after the response is sent, so poll briefly for the row. */
async function waitForAuditCount(expected, timeoutMs = 2000) {
  const start = Date.now();
  let count = await prisma.auditLog.count();
  while (count < expected && Date.now() - start < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 25));
    count = await prisma.auditLog.count();
  }
  return count;
}

describeDb('audit trail', () => {
  let admin;
  let app;

  beforeEach(async () => {
    await resetDatabase();
    admin = await createUser({ role: 'admin' });

    app = express();
    app.use(express.json());
    // Stand-in for the real authenticate middleware.
    app.use((req, _res, next) => {
      req.user = admin;
      next();
    });
    app.post(
      '/events/:id/reject',
      audit(AUDIT_ACTIONS.REJECT_EVENT, 'event', {
        details: (req) => ({ reason: req.body.reason }),
      }),
      (_req, res) => res.json({ ok: true }),
    );
    app.post('/events/:id/fail', audit(AUDIT_ACTIONS.APPROVE_EVENT, 'event'), () => {
      throw ApiError.notFound('Event not found');
    });
    app.use(errorHandler);
  });

  afterAll(() => prisma.$disconnect());

  it('records user, action, target and details after a successful request', async () => {
    await request(app).post('/events/42/reject').send({ reason: 'Clashes with exams' }).expect(200);

    expect(await waitForAuditCount(1)).toBe(1);
    const entry = await prisma.auditLog.findFirst();
    expect(entry).toMatchObject({
      user_id: admin.user_id,
      action: 'REJECT_EVENT',
      target_type: 'event',
      target_id: 42,
      details: { reason: 'Clashes with exams' },
    });
    expect(entry.timestamp).toBeInstanceOf(Date);
    expect(entry.ip_address).toBeTruthy();
  });

  it('does not record anything when the request fails', async () => {
    await request(app).post('/events/42/fail').expect(404);

    // Give the (absent) write a moment, then confirm nothing was logged.
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(await prisma.auditLog.count()).toBe(0);
  });

  it('rolls the audit entry back together with its transaction', async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await recordAudit({ action: 'CHECK_IN', targetType: 'booking', targetId: 1 }, { tx });
        throw new Error('simulated failure after the audit write');
      }),
    ).rejects.toThrow('simulated failure');

    expect(await prisma.auditLog.count()).toBe(0);
  });
});
