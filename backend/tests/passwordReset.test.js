import request from 'supertest';
import { createApp } from '../src/app.js';
import { clearOutbox, getOutbox } from '../src/services/emailService.js';
import { signAccessToken } from '../src/utils/tokens.js';
import { TEST_PASSWORD, createUser, describeDb, prisma, resetDatabase } from './helpers/db.js';

const app = createApp();
const NEW_PASSWORD = 'BrandNew123';

/** The reset email is sent in the background, so wait briefly for it to land. */
async function waitForEmailTo(address, timeoutMs = 2000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const message = getOutbox().find((m) => m.to === address);
    if (message) return message;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return null;
}

const tokenFrom = (message) =>
  new URL(message.text.match(/https?:\/\/\S+/)[0]).searchParams.get('token');

const forgot = (email) => request(app).post('/api/v1/auth/forgot-password').send({ email });
const reset = (token, password = NEW_PASSWORD) =>
  request(app).post('/api/v1/auth/reset-password').send({ token, password });
const login = (email, password) =>
  request(app).post('/api/v1/auth/login').send({ email, password });

describeDb('password reset', () => {
  beforeEach(async () => {
    await resetDatabase();
    clearOutbox();
  });
  afterAll(() => prisma.$disconnect());

  it('gives the same response for unknown emails and sends nothing', async () => {
    const user = await createUser();
    const known = await forgot(user.email);
    const unknown = await forgot('nobody@test.local');

    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(unknown.body).toEqual(known.body);

    await waitForEmailTo(user.email);
    expect(getOutbox().map((m) => m.to)).toEqual([user.email]);
  });

  it('emails a link, and the token in it sets a new password', async () => {
    const user = await createUser();
    await forgot(user.email).expect(200);

    const email = await waitForEmailTo(user.email);
    expect(email.subject).toMatch(/reset/i);
    const token = tokenFrom(email);

    // Only a hash is stored, never the token itself.
    const stored = await prisma.user.findUnique({ where: { user_id: user.user_id } });
    expect(stored.password_reset_token_hash).toHaveLength(64);
    expect(stored.password_reset_token_hash).not.toBe(token);

    await reset(token).expect(200);

    expect((await login(user.email, TEST_PASSWORD)).status).toBe(401);
    expect((await login(user.email, NEW_PASSWORD)).status).toBe(200);
    expect(await prisma.auditLog.count({ where: { action: 'PASSWORD_RESET_COMPLETED' } })).toBe(1);
  });

  it('allows each link to be used only once', async () => {
    const user = await createUser();
    await forgot(user.email);
    const token = tokenFrom(await waitForEmailTo(user.email));

    await reset(token).expect(200);
    const second = await reset(token, 'Another123');

    expect(second.status).toBe(400);
    expect(second.body.error.code).toBe('INVALID_RESET_TOKEN');
  });

  it('rejects an expired link', async () => {
    const user = await createUser();
    await forgot(user.email);
    const token = tokenFrom(await waitForEmailTo(user.email));
    await prisma.user.update({
      where: { user_id: user.user_id },
      data: { password_reset_expires_at: new Date(Date.now() - 1000) },
    });

    const res = await reset(token);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_RESET_TOKEN');
  });

  it('logs out sessions that existed before the reset', async () => {
    const user = await createUser();
    const oldSession = signAccessToken(user);
    await forgot(user.email);
    await reset(tokenFrom(await waitForEmailTo(user.email))).expect(200);

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${oldSession}`);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('SESSION_REVOKED');
  });

  it('applies the password rules to the new password', async () => {
    const res = await reset('x'.repeat(43), 'weak');

    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d) => d.field)).toContain('password');
  });
});
