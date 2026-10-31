import request from 'supertest';
import { createApp } from '../src/app.js';
import { newQrToken } from '../src/services/bookingService.js';
import { signAccessToken } from '../src/utils/tokens.js';
import {
  TEST_PASSWORD,
  closeDatabase,
  createEvent,
  createUser,
  describeDb,
  prisma,
  resetDatabase,
} from './helpers/db.js';

const app = createApp();
const asUser = (user) => ({ Authorization: `Bearer ${signAccessToken(user)}` });

/** Audit entries are written just after the response, so wait briefly for one. */
async function findAudit(action) {
  for (let i = 0; i < 20; i += 1) {
    const log = await prisma.auditLog.findFirst({ where: { action } });
    if (log) return log;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return null;
}

describeDb('Admin user management: create, edit and change role', () => {
  let admin;
  let superAdmin;
  let student;
  let organizer;

  const newStudentBody = (overrides = {}) => ({
    name: 'New Student',
    email: `new${Date.now()}@test.local`,
    role: 'student',
    student_id_number: `N${Date.now()}`.slice(0, 20),
    ...overrides,
  });

  beforeEach(async () => {
    await resetDatabase();
    admin = await createUser({ role: 'admin', access_level: 1 });
    superAdmin = await createUser({ role: 'admin', access_level: 2 });
    student = await createUser({ role: 'student', student_id_number: `S${Date.now()}` });
    organizer = await createUser({ role: 'organizer', org_name: 'Chess Club' });
  });
  afterAll(closeDatabase);

  describe('creating an account', () => {
    it('creates a student whose temporary password works, and logs it', async () => {
      const body = newStudentBody();

      const res = await request(app).post('/api/v1/admin/users').set(asUser(admin)).send(body);

      expect(res.status).toBe(201);
      expect(res.body.data.user).toMatchObject({
        role: 'student',
        email: body.email,
        is_active: true,
      });
      expect(res.headers['cache-control']).toBe('no-store');
      expect(JSON.stringify(res.body)).not.toContain('password_hash');

      const login = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: body.email, password: res.body.data.temporaryPassword });
      expect(login.status).toBe(200);

      const log = await findAudit('CREATE_USER');
      expect(log.target_id).toBe(res.body.data.user.user_id);
      expect(JSON.stringify(log.details)).not.toContain(res.body.data.temporaryPassword);
    });

    it('creates an organizer who is verified by default', async () => {
      const res = await request(app)
        .post('/api/v1/admin/users')
        .set(asUser(admin))
        .send({
          name: 'Club Lead',
          email: `lead${Date.now()}@test.local`,
          role: 'organizer',
          org_name: 'Drama Club',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.user).toMatchObject({
        role: 'organizer',
        org_name: 'Drama Club',
        verified: true,
      });
    });

    it('lets a super admin create admins, and a plain admin cannot', async () => {
      const body = { name: 'New Admin', email: `adm${Date.now()}@test.local`, role: 'admin' };

      const refused = await request(app).post('/api/v1/admin/users').set(asUser(admin)).send(body);
      expect(refused.status).toBe(403);
      expect(refused.body.error.code).toBe('SUPER_ADMIN_ONLY');

      const ok = await request(app).post('/api/v1/admin/users').set(asUser(superAdmin)).send(body);
      expect(ok.status).toBe(201);
      expect(ok.body.data.user).toMatchObject({ role: 'admin', access_level: 1 });
    });

    it('refuses an email or student ID that is already taken', async () => {
      const sameEmail = await request(app)
        .post('/api/v1/admin/users')
        .set(asUser(admin))
        .send(newStudentBody({ email: student.email }));
      expect(sameEmail.status).toBe(409);
      expect(sameEmail.body.error.code).toBe('EMAIL_EXISTS');

      const sameStudentId = await request(app)
        .post('/api/v1/admin/users')
        .set(asUser(admin))
        .send(newStudentBody({ student_id_number: student.student_id_number }));
      expect(sameStudentId.status).toBe(409);
      expect(sameStudentId.body.error.code).toBe('STUDENT_ID_EXISTS');
    });

    it('requires the fields that suit the role', async () => {
      const noStudentId = await request(app)
        .post('/api/v1/admin/users')
        .set(asUser(admin))
        .send({ name: 'No Id', email: `noid${Date.now()}@test.local`, role: 'student' });
      expect(noStudentId.status).toBe(400);

      const noOrg = await request(app)
        .post('/api/v1/admin/users')
        .set(asUser(admin))
        .send({ name: 'No Org', email: `noorg${Date.now()}@test.local`, role: 'organizer' });
      expect(noOrg.status).toBe(400);

      const badRole = await request(app)
        .post('/api/v1/admin/users')
        .set(asUser(admin))
        .send({ name: 'Bad Role', email: `bad${Date.now()}@test.local`, role: 'janitor' });
      expect(badRole.status).toBe(400);
    });

    it('does not let students or organizers create accounts', async () => {
      expect(
        (await request(app).post('/api/v1/admin/users').set(asUser(student)).send(newStudentBody()))
          .status,
      ).toBe(403);
      expect(
        (
          await request(app)
            .post('/api/v1/admin/users')
            .set(asUser(organizer))
            .send(newStudentBody())
        ).status,
      ).toBe(403);
    });
  });

  describe('editing details', () => {
    it('changes a student’s name and programme and logs the fields', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/users/${student.user_id}`)
        .set(asUser(admin))
        .send({ name: 'Renamed Student', programme: 'BBIT' });

      expect(res.status).toBe(200);
      expect(res.body.data.user).toMatchObject({ name: 'Renamed Student', programme: 'BBIT' });

      const log = await findAudit('UPDATE_USER');
      expect(log.details).toEqual({ fields: ['name', 'programme'] });
    });

    it('refuses fields that do not suit the user’s role', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/users/${student.user_id}`)
        .set(asUser(admin))
        .send({ org_name: 'Some Club' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('FIELD_NOT_FOR_ROLE');
    });

    it('refuses an email or student ID taken by someone else', async () => {
      const otherStudent = await createUser({
        role: 'student',
        student_id_number: `O${Date.now()}`,
      });

      const email = await request(app)
        .patch(`/api/v1/admin/users/${student.user_id}`)
        .set(asUser(admin))
        .send({ email: organizer.email });
      expect(email.status).toBe(409);
      expect(email.body.error.code).toBe('EMAIL_EXISTS');

      const studentId = await request(app)
        .patch(`/api/v1/admin/users/${student.user_id}`)
        .set(asUser(admin))
        .send({ student_id_number: otherStudent.student_id_number });
      expect(studentId.status).toBe(409);
      expect(studentId.body.error.code).toBe('STUDENT_ID_EXISTS');
    });

    it('allows keeping your own email when editing other fields', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/users/${student.user_id}`)
        .set(asUser(admin))
        .send({ email: student.email, name: 'Same Email' });

      expect(res.status).toBe(200);
    });

    it('refuses an empty edit and an edit of your own account', async () => {
      const empty = await request(app)
        .patch(`/api/v1/admin/users/${student.user_id}`)
        .set(asUser(admin))
        .send({});
      expect(empty.status).toBe(400);

      const self = await request(app)
        .patch(`/api/v1/admin/users/${admin.user_id}`)
        .set(asUser(admin))
        .send({ name: 'Me' });
      expect(self.status).toBe(403);
      expect(self.body.error.code).toBe('SELF_ACTION');
    });

    it('lets only a super admin edit another admin', async () => {
      const byAdmin = await request(app)
        .patch(`/api/v1/admin/users/${superAdmin.user_id}`)
        .set(asUser(admin))
        .send({ name: 'Hijack' });
      expect(byAdmin.status).toBe(403);

      const bySuper = await request(app)
        .patch(`/api/v1/admin/users/${admin.user_id}`)
        .set(asUser(superAdmin))
        .send({ name: 'Renamed Admin' });
      expect(bySuper.status).toBe(200);
    });
  });

  describe('changing a role', () => {
    it('turns a student into an organizer, clears student fields and ends sessions', async () => {
      const oldSession = asUser(student);

      const res = await request(app)
        .patch(`/api/v1/admin/users/${student.user_id}/role`)
        .set(asUser(admin))
        .send({ role: 'organizer', org_name: 'Test Club' });

      expect(res.status).toBe(200);
      expect(res.body.data.user).toMatchObject({
        role: 'organizer',
        org_name: 'Test Club',
        student_id_number: null,
        programme: null,
      });
      expect((await request(app).get('/api/v1/bookings/me').set(oldSession)).status).toBe(401);

      const log = await findAudit('CHANGE_ROLE');
      expect(log.details).toEqual({ from: 'student', to: 'organizer' });
    });

    it('turns an organizer into a student', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/users/${organizer.user_id}/role`)
        .set(asUser(admin))
        .send({ role: 'student', student_id_number: `C${Date.now()}`.slice(0, 20) });

      expect(res.status).toBe(200);
      expect(res.body.data.user).toMatchObject({ role: 'student', org_name: null });
    });

    it('refuses once the user has bookings', async () => {
      const event = await createEvent();
      await prisma.booking.create({
        data: { student_id: student.user_id, event_id: event.event_id, qr_code: newQrToken() },
      });

      const res = await request(app)
        .patch(`/api/v1/admin/users/${student.user_id}/role`)
        .set(asUser(admin))
        .send({ role: 'organizer', org_name: 'Nope' });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('ROLE_HAS_HISTORY');
    });

    it('refuses once the user has organized events', async () => {
      await createEvent({ organizer_id: organizer.user_id });

      const res = await request(app)
        .patch(`/api/v1/admin/users/${organizer.user_id}/role`)
        .set(asUser(admin))
        .send({ role: 'student', student_id_number: `E${Date.now()}`.slice(0, 20) });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('ROLE_HAS_HISTORY');
    });

    it('refuses a change to the same role and to your own role', async () => {
      const same = await request(app)
        .patch(`/api/v1/admin/users/${organizer.user_id}/role`)
        .set(asUser(admin))
        .send({ role: 'organizer', org_name: 'Again' });
      expect(same.status).toBe(409);
      expect(same.body.error.code).toBe('SAME_ROLE');

      const self = await request(app)
        .patch(`/api/v1/admin/users/${admin.user_id}/role`)
        .set(asUser(admin))
        .send({ role: 'student', student_id_number: `X${Date.now()}`.slice(0, 20) });
      expect(self.status).toBe(403);
      expect(self.body.error.code).toBe('SELF_ACTION');
    });

    it('lets only a super admin make someone an admin', async () => {
      const byAdmin = await request(app)
        .patch(`/api/v1/admin/users/${organizer.user_id}/role`)
        .set(asUser(admin))
        .send({ role: 'admin' });
      expect(byAdmin.status).toBe(403);
      expect(byAdmin.body.error.code).toBe('SUPER_ADMIN_ONLY');

      const bySuper = await request(app)
        .patch(`/api/v1/admin/users/${organizer.user_id}/role`)
        .set(asUser(superAdmin))
        .send({ role: 'admin' });
      expect(bySuper.status).toBe(200);
      expect(bySuper.body.data.user).toMatchObject({ role: 'admin', access_level: 1 });
    });

    it('refuses a student ID that is already taken', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/users/${organizer.user_id}/role`)
        .set(asUser(admin))
        .send({ role: 'student', student_id_number: student.student_id_number });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('STUDENT_ID_EXISTS');
    });

    it('does not let students change roles', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/users/${organizer.user_id}/role`)
        .set(asUser(student))
        .send({ role: 'admin' });

      expect(res.status).toBe(403);
    });
  });
});