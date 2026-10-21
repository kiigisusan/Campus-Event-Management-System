import request from 'supertest';
import { createApp } from '../src/app.js';
import {
  TEST_PASSWORD,
  closeDatabase,
  createUser,
  describeDb,
  resetDatabase,
} from './helpers/db.js';

const app = createApp();

const login = (email, password) =>
  request(app).post('/api/v1/auth/login').send({ email, password });

describeDb('login rate limiting', () => {
  beforeAll(() => resetDatabase());
  afterAll(closeDatabase);

  it('blocks an account after 5 failed attempts from the same network', async () => {
    const user = await createUser();

    for (let i = 0; i < 5; i += 1) {
      expect((await login(user.email, 'WrongPass1')).status).toBe(401);
    }
    const blocked = await login(user.email, TEST_PASSWORD);

    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('TOO_MANY_REQUESTS');
    expect(blocked.headers.ratelimit).toBeDefined(); // tells the client when to retry
  });

  it('does not block other accounts on the same network', async () => {
    const other = await createUser();
    expect((await login(other.email, TEST_PASSWORD)).status).toBe(200);
  });

  it('does not count successful logins', async () => {
    const user = await createUser();
    for (let i = 0; i < 7; i += 1) {
      expect((await login(user.email, TEST_PASSWORD)).status).toBe(200);
    }
  });

  it('limits password reset emails per account', async () => {
    const user = await createUser();
    const forgot = () =>
      request(app).post('/api/v1/auth/forgot-password').send({ email: user.email });

    for (let i = 0; i < 3; i += 1) {
      expect((await forgot()).status).toBe(200);
    }
    expect((await forgot()).status).toBe(429);
  });
});
