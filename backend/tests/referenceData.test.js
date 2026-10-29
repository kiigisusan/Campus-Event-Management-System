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

describeDb('Categories and venues', () => {
  let admin;
  let student;

  beforeEach(async () => {
    await resetDatabase();
    admin = await createUser({ role: 'admin' });
    student = await createUser({ role: 'student', student_id_number: `S${Date.now()}` });
  });
  afterAll(closeDatabase);

  describe('categories', () => {
    it('lists categories to anyone, sorted by name', async () => {
      await prisma.category.createMany({ data: [{ name: 'Sports' }, { name: 'Career Fair' }] });

      const res = await request(app).get('/api/v1/categories');

      expect(res.status).toBe(200);
      expect(res.body.data.categories.map((c) => c.name)).toEqual(['Career Fair', 'Sports']);
    });

    it('lets an admin create a category and logs it', async () => {
      const res = await request(app)
        .post('/api/v1/categories')
        .set(asUser(admin))
        .send({ name: 'Hackathon', description: 'Coding competitions' });

      expect(res.status).toBe(201);
      expect(res.body.data.category).toMatchObject({ name: 'Hackathon' });
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(await prisma.auditLog.count({ where: { action: 'CREATE_CATEGORY' } })).toBe(1);
    });

    it('refuses a duplicate name', async () => {
      await prisma.category.create({ data: { name: 'Hackathon' } });

      const res = await request(app)
        .post('/api/v1/categories')
        .set(asUser(admin))
        .send({ name: 'Hackathon' });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CATEGORY_EXISTS');
    });

    it('lets an admin rename one, but not to a name already taken', async () => {
      const a = await prisma.category.create({ data: { name: 'Alpha' } });
      await prisma.category.create({ data: { name: 'Beta' } });
      const url = `/api/v1/categories/${a.category_id}`;

      const renamed = await request(app).patch(url).set(asUser(admin)).send({ name: 'Gamma' });
      expect(renamed.status).toBe(200);
      expect(renamed.body.data.category.name).toBe('Gamma');

      const clash = await request(app).patch(url).set(asUser(admin)).send({ name: 'Beta' });
      expect(clash.status).toBe(409);
    });

    it('deletes an unused category but protects one that events use', async () => {
      const unused = await prisma.category.create({ data: { name: 'Unused' } });
      const event = await createEvent();

      const ok = await request(app)
        .delete(`/api/v1/categories/${unused.category_id}`)
        .set(asUser(admin));
      expect(ok.status).toBe(200);

      const blocked = await request(app)
        .delete(`/api/v1/categories/${event.category_id}`)
        .set(asUser(admin));
      expect(blocked.status).toBe(409);
      expect(blocked.body.error.code).toBe('CATEGORY_IN_USE');
    });

    it('returns 404 for a category that does not exist', async () => {
      const res = await request(app).delete('/api/v1/categories/999999').set(asUser(admin));
      expect(res.status).toBe(404);
    });

    it('does not let students or visitors change categories', async () => {
      const body = { name: 'Sneaky' };
      expect((await request(app).post('/api/v1/categories').send(body)).status).toBe(401);
      expect(
        (await request(app).post('/api/v1/categories').set(asUser(student)).send(body)).status,
      ).toBe(403);
    });

    it('rejects a name that is too short', async () => {
      const res = await request(app)
        .post('/api/v1/categories')
        .set(asUser(admin))
        .send({ name: 'x' });

      expect(res.status).toBe(400);
    });
  });

  describe('venues', () => {
    it('lists venues to anyone', async () => {
      await prisma.venue.create({ data: { name: 'Hall', location: 'Block A', capacity: 100 } });

      const res = await request(app).get('/api/v1/venues');

      expect(res.status).toBe(200);
      expect(res.body.data.venues).toHaveLength(1);
    });

    it('lets an admin create a venue', async () => {
      const res = await request(app)
        .post('/api/v1/venues')
        .set(asUser(admin))
        .send({ name: 'Test Hall', location: 'Block B, First Floor', capacity: 50 });

      expect(res.status).toBe(201);
      expect(res.body.data.venue).toMatchObject({ name: 'Test Hall', capacity: 50 });
    });

    it('rejects a venue with zero capacity', async () => {
      const res = await request(app)
        .post('/api/v1/venues')
        .set(asUser(admin))
        .send({ name: 'Broken', location: 'Nowhere', capacity: 0 });

      expect(res.status).toBe(400);
    });

    it('does not let a venue shrink below an event that uses it', async () => {
      const event = await createEvent({ capacity: 50 }); // its venue holds 500

      const tooSmall = await request(app)
        .patch(`/api/v1/venues/${event.venue_id}`)
        .set(asUser(admin))
        .send({ capacity: 10 });
      expect(tooSmall.status).toBe(409);
      expect(tooSmall.body.error.code).toBe('VENUE_TOO_SMALL');

      const fine = await request(app)
        .patch(`/api/v1/venues/${event.venue_id}`)
        .set(asUser(admin))
        .send({ capacity: 60 });
      expect(fine.status).toBe(200);
    });

    it('deletes an unused venue but protects one that events use', async () => {
      const unused = await prisma.venue.create({
        data: { name: 'Spare', location: 'Block C', capacity: 20 },
      });
      const event = await createEvent();

      const ok = await request(app).delete(`/api/v1/venues/${unused.venue_id}`).set(asUser(admin));
      expect(ok.status).toBe(200);

      const blocked = await request(app)
        .delete(`/api/v1/venues/${event.venue_id}`)
        .set(asUser(admin));
      expect(blocked.status).toBe(409);
      expect(blocked.body.error.code).toBe('VENUE_IN_USE');
    });

    it('does not let students change venues', async () => {
      const res = await request(app)
        .post('/api/v1/venues')
        .set(asUser(student))
        .send({ name: 'Sneaky', location: 'Somewhere', capacity: 10 });

      expect(res.status).toBe(403);
    });
  });
});