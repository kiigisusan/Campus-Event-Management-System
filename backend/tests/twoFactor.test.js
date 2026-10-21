import request from 'supertest';
import { createApp } from '../src/app.js';
import { clearOutbox, getOutbox } from '../src/services/emailService.js';
import { MAX_CODE_ATTEMPTS } from '../src/services/twoFactorService.js';
import { signAccessToken } from '../src/utils/tokens.js';
import { TEST_PASSWORD, createUser, describeDb, prisma, resetDatabase } from './helpers/db.js';

const app = createApp();

const login = (email) =>
  request(app).post('/api/v1/auth/login').send({ email, password: TEST_PASSWORD });
const verify = (twoFactorToken, code) =>
  request(app).post('/api/v1/auth/2fa/verify').send({ twoFactorToken, code });

/** The latest emailed code for an address (2FA emails are sent before login responds). */
const latestCodeFor = (email) => {
  const message = getOutbox()
    .filter((m) => m.to === email)
    .at(-1);
  return message.text.match(/\b(\d{6})\b/)[1];
};

/** Any 6-digit code that is not the real one. */
const wrongCode = (code) => String((Number(code) + 1) % 1_000_000).padStart(6, '0');

describeDb('two-factor authentication', () => {
  beforeEach(async () => {
    await resetDatabase();
    clearOutbox();
  });
  afterAll(() => prisma.$disconnect());

  it('admins get a code instead of a session, then a session after the code', async () => {
    const admin = await createUser({ role: 'admin' });

    const step1 = await login(admin.email);
    expect(step1.status).toBe(200);
    expect(step1.body.data).toMatchObject({ twoFactorRequired: true, expiresInMinutes: 10 });
    expect(step1.body.data.token).toBeUndefined();
    expect(step1.body.data.sentTo).not.toBe(admin.email); // masked

    const step2 = await verify(step1.body.data.twoFactorToken, latestCodeFor(admin.email));
    expect(step2.status).toBe(200);
    expect(step2.body.data.token).toEqual(expect.any(String));
    expect(step2.body.data.user.role).toBe('admin');

    const me = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${step2.body.data.token}`);
    expect(me.status).toBe(200);
  });

  it('students log in without a code', async () => {
    const student = await createUser({ role: 'student' });
    const res = await login(student.email);

    expect(res.body.data.twoFactorRequired).toBe(false);
    expect(res.body.data.token).toEqual(expect.any(String));
    expect(getOutbox()).toHaveLength(0);
  });

  it('stores only a hash of the code', async () => {
    const admin = await createUser({ role: 'admin' });
    await login(admin.email);

    const stored = await prisma.user.findUnique({ where: { user_id: admin.user_id } });
    expect(stored.twofa_code_hash).toHaveLength(64);
    expect(stored.twofa_code_hash).not.toContain(latestCodeFor(admin.email));
  });

  it('rejects a wrong code and counts down the attempts', async () => {
    const admin = await createUser({ role: 'admin' });
    const { twoFactorToken } = (await login(admin.email)).body.data;

    const res = await verify(twoFactorToken, wrongCode(latestCodeFor(admin.email)));

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_2FA_CODE');
    expect(res.body.error.message).toMatch(`${MAX_CODE_ATTEMPTS - 1} attempts left`);
    expect(await prisma.auditLog.count({ where: { action: 'TWOFA_FAILED' } })).toBe(1);
  });

  it('locks the code after too many wrong attempts, even if the right code follows', async () => {
    const admin = await createUser({ role: 'admin' });
    const { twoFactorToken } = (await login(admin.email)).body.data;
    const code = latestCodeFor(admin.email);

    for (let i = 0; i < MAX_CODE_ATTEMPTS; i += 1) {
      await verify(twoFactorToken, wrongCode(code));
    }
    const res = await verify(twoFactorToken, code);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TWOFA_LOCKED');
  });

  it('accepts each code only once', async () => {
    const admin = await createUser({ role: 'admin' });
    const { twoFactorToken } = (await login(admin.email)).body.data;
    const code = latestCodeFor(admin.email);

    await verify(twoFactorToken, code).expect(200);
    const replay = await verify(twoFactorToken, code);

    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe('TWOFA_EXPIRED');
  });

  it('rejects an expired code', async () => {
    const admin = await createUser({ role: 'admin' });
    const { twoFactorToken } = (await login(admin.email)).body.data;
    await prisma.user.update({
      where: { user_id: admin.user_id },
      data: { twofa_expires_at: new Date(Date.now() - 1000) },
    });

    const res = await verify(twoFactorToken, latestCodeFor(admin.email));

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TWOFA_EXPIRED');
  });

  it('does not accept the 2FA token as a session, or a session token for 2FA', async () => {
    const admin = await createUser({ role: 'admin' });
    const { twoFactorToken } = (await login(admin.email)).body.data;

    const asSession = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${twoFactorToken}`);
    expect(asSession.status).toBe(401);

    const asTwoFactor = await verify(signAccessToken(admin), latestCodeFor(admin.email));
    expect(asTwoFactor.status).toBe(401);
    expect(asTwoFactor.body.error.code).toBe('INVALID_TOKEN');
  });
});
