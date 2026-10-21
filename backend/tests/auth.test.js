import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { authenticate, authorize } from '../src/middleware/authenticate.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { signAccessToken } from '../src/utils/tokens.js';
import { TEST_PASSWORD, createUser, describeDb, prisma, resetDatabase } from './helpers/db.js';

const app = createApp();

const studentPayload = (overrides = {}) => ({
  name: 'Kevin Mwangi',
  email: 'Kevin@Example.com ',
  password: 'Secret123',
  role: 'student',
  student_id_number: '123456',
  programme: 'BSc Computer Science',
  ...overrides,
});

const login = (email, password = TEST_PASSWORD) =>
  request(app).post('/api/v1/auth/login').send({ email, password });

/** Signs a token by hand with a chosen issue time, to simulate an old or expired session. */
function tokenIssuedSecondsAgo(user, secondsAgo, expiresInSeconds) {
  const iat = Math.floor(Date.now() / 1000) - secondsAgo;
  return jwt.sign(
    { type: 'access', role: user.role, tv: user.token_version, iat, exp: iat + expiresInSeconds },
    process.env.JWT_SECRET,
    { issuer: 'cems-api', subject: String(user.user_id) },
  );
}

describeDb('auth', () => {
  beforeEach(() => resetDatabase());
  afterAll(() => prisma.$disconnect());

  describe('POST /auth/register', () => {
    it('creates a student, normalises the email and returns a session', async () => {
      const res = await request(app).post('/api/v1/auth/register').send(studentPayload());

      expect(res.status).toBe(201);
      expect(res.body.data.token).toEqual(expect.any(String));
      expect(res.body.data.user).toMatchObject({ email: 'kevin@example.com', role: 'student' });
      expect(res.body.data.user.password_hash).toBeUndefined();

      const saved = await prisma.user.findUnique({ where: { email: 'kevin@example.com' } });
      expect(saved.password_hash).not.toBe('Secret123'); // stored as a bcrypt hash
      expect(saved.password_hash).toMatch(/^\$2[aby]\$/);
      expect(await prisma.auditLog.count({ where: { action: 'REGISTER' } })).toBe(1);
    });

    it('requires an organisation name for organizers', async () => {
      const res = await request(app).post('/api/v1/auth/register').send({
        name: 'Club',
        email: 'club@example.com',
        password: 'Secret123',
        role: 'organizer',
      });

      expect(res.status).toBe(400);
      expect(res.body.error.details.map((d) => d.field)).toContain('org_name');
    });

    it('does not allow registering as an admin', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send(studentPayload({ role: 'admin' }));

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects weak passwords with a field message', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send(studentPayload({ password: 'short' }));

      expect(res.status).toBe(400);
      expect(res.body.error.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'password' })]),
      );
    });

    it('returns 409 for an email that is already registered', async () => {
      await request(app).post('/api/v1/auth/register').send(studentPayload()).expect(201);
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send(studentPayload({ student_id_number: '999999' }));

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('EMAIL_TAKEN');
    });
  });

  describe('POST /auth/login', () => {
    it('logs in with the right password', async () => {
      const user = await createUser();
      const res = await login(user.email);

      expect(res.status).toBe(200);
      expect(res.body.data.user.user_id).toBe(user.user_id);
      expect(await prisma.auditLog.count({ where: { action: 'LOGIN_SUCCESS' } })).toBe(1);
    });

    it('gives the same error for a wrong password and an unknown email', async () => {
      const user = await createUser();
      const wrongPassword = await login(user.email, 'WrongPass1');
      const unknownEmail = await login('nobody@test.local');

      expect(wrongPassword.status).toBe(401);
      expect(unknownEmail.status).toBe(401);
      expect(wrongPassword.body.error).toEqual(unknownEmail.body.error);
      expect(await prisma.auditLog.count({ where: { action: 'LOGIN_FAILED' } })).toBe(2);
    });

    it('refuses deactivated accounts', async () => {
      const user = await createUser({ is_active: false });
      const res = await login(user.email);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('ACCOUNT_DISABLED');
    });
  });

  describe('sessions', () => {
    it('GET /auth/me returns the logged-in user', async () => {
      const user = await createUser();
      const { token } = (await login(user.email)).body.data;

      const res = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.user.email).toBe(user.email);
    });

    it('rejects requests without a token', async () => {
      const res = await request(app).get('/api/v1/auth/me');
      expect(res.status).toBe(401);
    });

    it('rejects a tampered token', async () => {
      const user = await createUser();
      const token = `${signAccessToken(user)}x`;

      const res = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_TOKEN');
    });

    it('logout revokes the token immediately', async () => {
      const user = await createUser();
      const { token } = (await login(user.email)).body.data;
      const auth = { Authorization: `Bearer ${token}` };

      await request(app).post('/api/v1/auth/logout').set(auth).expect(200);
      const res = await request(app).get('/api/v1/auth/me').set(auth);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('SESSION_REVOKED');
    });

    it('expires a session after the inactivity timeout', async () => {
      const user = await createUser();
      // Issued 31 minutes ago with a 30 minute lifetime.
      const token = tokenIssuedSecondsAgo(user, 31 * 60, 30 * 60);

      const res = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('SESSION_EXPIRED');
    });

    it('renews the token while the user is active', async () => {
      const user = await createUser();
      const token = tokenIssuedSecondsAgo(user, 5 * 60, 30 * 60);

      const res = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      const renewed = res.headers['x-access-token'];
      expect(renewed).toEqual(expect.any(String));
      const { exp } = jwt.decode(renewed);
      // The renewed token gets a full new 30 minutes from now.
      expect(exp - Math.floor(Date.now() / 1000)).toBeGreaterThan(29 * 60);
    });

    it('blocks a deactivated user even with a token issued earlier', async () => {
      const user = await createUser();
      const token = signAccessToken(user);
      await prisma.user.update({ where: { user_id: user.user_id }, data: { is_active: false } });

      const res = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('ACCOUNT_DISABLED');
    });
  });

  describe('authorize (role-based access)', () => {
    const roleApp = express();
    roleApp.get('/admin-only', authenticate, authorize('admin'), (_req, res) =>
      res.json({ ok: 1 }),
    );
    roleApp.get('/super-only', authenticate, authorize('super_admin'), (_req, res) =>
      res.json({ ok: 1 }),
    );
    roleApp.get('/staff', authenticate, authorize('organizer', 'admin'), (_req, res) =>
      res.json({ ok: 1 }),
    );
    roleApp.use(errorHandler);

    const call = (path, user) =>
      request(roleApp)
        .get(path)
        .set('Authorization', `Bearer ${signAccessToken(user)}`);

    it('lets each role reach only its routes', async () => {
      const student = await createUser({ role: 'student' });
      const organizer = await createUser({ role: 'organizer' });
      const admin = await createUser({ role: 'admin', access_level: 1 });
      const superAdmin = await createUser({ role: 'admin', access_level: 2 });

      expect((await call('/admin-only', student)).status).toBe(403);
      expect((await call('/staff', student)).status).toBe(403);
      expect((await call('/staff', organizer)).status).toBe(200);
      expect((await call('/admin-only', admin)).status).toBe(200);
      expect((await call('/super-only', admin)).status).toBe(403);
      expect((await call('/super-only', superAdmin)).status).toBe(200);
      expect((await call('/admin-only', superAdmin)).status).toBe(200);
    });
  });
});
