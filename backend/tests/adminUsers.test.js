import request from 'supertest';
import { createApp } from '../src/app.js';
import { signAccessToken } from '../src/utils/tokens.js';
import {
  TEST_PASSWORD,
  closeDatabase,
  createUser,
  describeDb,
  prisma,
  resetDatabase,
} from './helpers/db.js';

const app = createApp();
const asUser = (user) => ({ Authorization: `Bearer ${signAccessToken(user)}` });

describeDb('Admin user management', () => {
  let admin;
  let superAdmin;
  let student;
  let organizer;

  beforeEach(async () => {
    await resetDatabase();
    admin = await createUser({ role: 'admin', access_level: 1, name: 'Plain Admin' });
    superAdmin = await createUser({ role: 'admin', access_level: 2, name: 'Super Admin' });
    student = await createUser({
      role: 'student',
      name: 'Kevin Mwangi',
      student_id_number: `S${Date.now()}`,
    });
    organizer = await createUser({ role: 'organizer', org_name: 'Chess Club' });
  });
  afterAll(closeDatabase);

  describe('listing', () => {
    it('lists users without any password or token fields', async () => {
      const res = await request(app).get('/api/v1/admin/users').set(asUser(admin));

      expect(res.status).toBe(200);
      expect(res.body.data.users).toHaveLength(4);
      const text = JSON.stringify(res.body);
      expect(text).not.toContain('password_hash');
      expect(text).not.toContain('token_version');
      expect(text).not.toContain('twofa');
    });

    it('filters by role', async () => {
      const res = await request(app).get('/api/v1/admin/users?role=student').set(asUser(admin));

      expect(res.body.data.users.map((u) => u.user_id)).toEqual([student.user_id]);
    });

    it('searches by name and by organisation', async () => {
      const byName = await request(app).get('/api/v1/admin/users?search=kevin').set(asUser(admin));
      expect(byName.body.data.users.map((u) => u.user_id)).toEqual([student.user_id]);

      const byOrg = await request(app).get('/api/v1/admin/users?search=chess').set(asUser(admin));
      expect(byOrg.body.data.users.map((u) => u.user_id)).toEqual([organizer.user_id]);
    });

    it('filters by active status', async () => {
      await prisma.user.update({ where: { user_id: student.user_id }, data: { is_active: false } });

      const res = await request(app)
        .get('/api/v1/admin/users?is_active=false')
        .set(asUser(admin));

      expect(res.body.data.users.map((u) => u.user_id)).toEqual([student.user_id]);
    });

    it('shows one user, and 404 for a missing one', async () => {
      const found = await request(app)
        .get(`/api/v1/admin/users/${student.user_id}`)
        .set(asUser(admin));
      expect(found.status).toBe(200);
      expect(found.body.data.user.email).toBe(student.email);

      const missing = await request(app).get('/api/v1/admin/users/999999').set(asUser(admin));
      expect(missing.status).toBe(404);
    });

    it('is closed to visitors, students and organizers', async () => {
      expect((await request(app).get('/api/v1/admin/users')).status).toBe(401);
      expect((await request(app).get('/api/v1/admin/users').set(asUser(student))).status).toBe(403);
      expect((await request(app).get('/api/v1/admin/users').set(asUser(organizer))).status).toBe(
        403,
      );
    });
  });

  describe('deactivating and activating', () => {
    it('deactivates a user, ends their session and logs it', async () => {
      const oldSession = asUser(student);

      const res = await request(app)
        .patch(`/api/v1/admin/users/${student.user_id}/deactivate`)
        .set(asUser(admin));

      expect(res.status).toBe(200);
      expect(res.body.data.user.is_active).toBe(false);

      // The token the student held before no longer works.
      const old = await request(app).get('/api/v1/bookings/me').set(oldSession);
      expect(old.status).toBe(401);

      // And they cannot log in again.
      const login = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: student.email, password: TEST_PASSWORD });
      expect(login.status).toBeGreaterThanOrEqual(400);

      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(await prisma.auditLog.count({ where: { action: 'DEACTIVATE_USER' } })).toBe(1);
    });

    it('reactivates a user so they can log in again', async () => {
      await request(app)
        .patch(`/api/v1/admin/users/${student.user_id}/deactivate`)
        .set(asUser(admin))
        .expect(200);

      const res = await request(app)
        .patch(`/api/v1/admin/users/${student.user_id}/activate`)
        .set(asUser(admin));
      expect(res.status).toBe(200);
      expect(res.body.data.user.is_active).toBe(true);

      const login = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: student.email, password: TEST_PASSWORD });
      expect(login.status).toBe(200);
    });

    it('refuses to repeat an action', async () => {
      const again = await request(app)
        .patch(`/api/v1/admin/users/${student.user_id}/activate`)
        .set(asUser(admin));

      expect(again.status).toBe(409);
      expect(again.body.error.code).toBe('ALREADY_ACTIVE');
    });

    it('does not let an admin deactivate their own account', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/users/${admin.user_id}/deactivate`)
        .set(asUser(admin));

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('SELF_ACTION');
    });

    it('lets only a super admin manage other admins', async () => {
      const byAdmin = await request(app)
        .patch(`/api/v1/admin/users/${superAdmin.user_id}/deactivate`)
        .set(asUser(admin));
      expect(byAdmin.status).toBe(403);
      expect(byAdmin.body.error.code).toBe('SUPER_ADMIN_ONLY');

      const bySuper = await request(app)
        .patch(`/api/v1/admin/users/${admin.user_id}/deactivate`)
        .set(asUser(superAdmin));
      expect(bySuper.status).toBe(200);
    });

    it('does not let students deactivate anyone', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/users/${organizer.user_id}/deactivate`)
        .set(asUser(student));

      expect(res.status).toBe(403);
    });
  });

  describe('resetting a password', () => {
    it('sets a temporary password that works, and the old one stops working', async () => {
      const oldSession = asUser(student);

      const res = await request(app)
        .post(`/api/v1/admin/users/${student.user_id}/reset-password`)
        .set(asUser(admin));

      expect(res.status).toBe(200);
      const { temporaryPassword } = res.body.data;
      expect(temporaryPassword).toHaveLength(12);
      expect(temporaryPassword).toMatch(/[A-Za-z]/);
      expect(temporaryPassword).toMatch(/\d/);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(JSON.stringify(res.body)).not.toContain('password_hash');

      const newLogin = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: student.email, password: temporaryPassword });
      expect(newLogin.status).toBe(200);

      const oldLogin = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: student.email, password: TEST_PASSWORD });
      expect(oldLogin.status).toBe(401);

      // Sessions from before the reset are ended.
      expect((await request(app).get('/api/v1/bookings/me').set(oldSession)).status).toBe(401);
    });

    it('never writes the temporary password to the audit log', async () => {
      const res = await request(app)
        .post(`/api/v1/admin/users/${student.user_id}/reset-password`)
        .set(asUser(admin));
      await new Promise((resolve) => setTimeout(resolve, 200));

      const logs = await prisma.auditLog.findMany({ where: { action: 'ADMIN_RESET_PASSWORD' } });
      expect(logs).toHaveLength(1);
      expect(JSON.stringify(logs)).not.toContain(res.body.data.temporaryPassword);
    });

    it('does not let an admin reset their own password this way', async () => {
      const res = await request(app)
        .post(`/api/v1/admin/users/${admin.user_id}/reset-password`)
        .set(asUser(admin));

      expect(res.status).toBe(403);
    });

    it('does not let a plain admin reset another admin', async () => {
      const res = await request(app)
        .post(`/api/v1/admin/users/${superAdmin.user_id}/reset-password`)
        .set(asUser(admin));

      expect(res.status).toBe(403);
    });
  });
});