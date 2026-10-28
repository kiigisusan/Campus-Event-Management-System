/**
 * Email-based two-factor authentication (2FA) for the roles in TWOFA_ROLES
 * (admins by default).
 *
 * Flow:
 *  1. POST /auth/login with a correct password returns
 *     { twoFactorRequired: true, twoFactorToken } instead of a session, and a
 *     6-digit code is emailed to the user.
 *  2. POST /auth/2fa/verify { twoFactorToken, code } returns the session.
 *
 * The twoFactorToken proves step 1 passed (it is useless as a session token).
 * Codes expire after TWOFA_CODE_TTL_MINUTES, work once, and are locked after
 * MAX_CODE_ATTEMPTS wrong tries; the user must then log in again for a new code.
 */
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { prisma } from '../config/prisma.js';
import { AUDIT_ACTIONS } from '../constants/auditActions.js';
import { twoFactorCodeEmail } from '../emails/templates.js';
import { ApiError } from '../utils/ApiError.js';
import { TOKEN_TYPES, signTwoFactorToken, verifyToken } from '../utils/tokens.js';
import { recordAudit } from './auditService.js';
import { sendEmail } from './emailService.js';

export const MAX_CODE_ATTEMPTS = 5;

/** @param {{ role: string }} user */
export const requiresTwoFactor = (user) => env.TWOFA_ROLES.includes(user.role);

/**
 * Keyed hash of the code. A 6-digit code has only a million possibilities, so
 * a plain hash could be reversed by trying them all; the HMAC key (JWT_SECRET)
 * and the user id stop that if the database alone leaks.
 */
const hashCode = (userId, code) =>
  crypto.createHmac('sha256', env.JWT_SECRET).update(`${userId}:${code}`).digest('hex');

const codesMatch = (expectedHash, userId, code) => {
  const actual = Buffer.from(hashCode(userId, code), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
};

/** "admin@cems.test" -> "a***n@cems.test", so the UI can say where the code went. */
function maskEmail(email) {
  const [local, domain] = email.split('@');
  const visible = local.length <= 2 ? local[0] : `${local[0]}***${local.at(-1)}`;
  return `${visible}@${domain}`;
}

/**
 * Generates and emails a new login code, replacing any previous one.
 *
 * @param {import('@prisma/client').User} user
 * @param {{ ipAddress?: string }} context
 * @returns {Promise<{ twoFactorRequired: true, twoFactorToken: string, sentTo: string, expiresInMinutes: number }>}
 */
export async function sendLoginCode(user, { ipAddress } = {}) {
  const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');

  await prisma.user.update({
    where: { user_id: user.user_id },
    data: {
      twofa_code_hash: hashCode(user.user_id, code),
      twofa_expires_at: new Date(Date.now() + env.TWOFA_CODE_TTL_MINUTES * 60_000),
      twofa_attempts: 0,
    },
  });

  try {
    await sendEmail({
      to: user.email,
      ...twoFactorCodeEmail({ name: user.name, code, ttlMinutes: env.TWOFA_CODE_TTL_MINUTES }),
    });
  } catch (error) {
    console.error(`Failed to send 2FA code to user ${user.user_id}:`, error);
    throw new ApiError(
      503,
      'EMAIL_UNAVAILABLE',
      'We could not send your login code. Please try again in a few minutes.',
    );
  }

  await recordAudit({
    userId: user.user_id,
    action: AUDIT_ACTIONS.TWOFA_CODE_SENT,
    targetType: 'user',
    targetId: user.user_id,
    ipAddress,
  });

  return {
    twoFactorRequired: true,
    twoFactorToken: signTwoFactorToken(user),
    sentTo: maskEmail(user.email),
    expiresInMinutes: env.TWOFA_CODE_TTL_MINUTES,
  };
}

/**
 * Checks a submitted code. Returns the user on success so the caller can
 * start the session; throws ApiError otherwise.
 *
 * @param {{ twoFactorToken: string, code: string }} input
 * @param {{ ipAddress?: string }} context
 * @returns {Promise<import('@prisma/client').User>}
 */
export async function verifyLoginCode({ twoFactorToken, code }, { ipAddress } = {}) {
  const loginAgain = (message, errorCode) => ApiError.unauthorized(message, errorCode);

  let payload;
  try {
    payload = verifyToken(twoFactorToken, TOKEN_TYPES.TWOFA);
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw loginAgain('Your login code has expired. Please log in again.', 'TWOFA_EXPIRED');
    }
    throw loginAgain('This login attempt is not valid. Please log in again.', 'INVALID_TOKEN');
  }

  const user = await prisma.user.findUnique({ where: { user_id: Number(payload.sub) } });
  if (!user || !user.is_active || user.token_version !== payload.tv) {
    throw loginAgain('This login attempt is not valid. Please log in again.', 'INVALID_TOKEN');
  }
  if (!user.twofa_code_hash || !user.twofa_expires_at || user.twofa_expires_at <= new Date()) {
    throw loginAgain('Your login code has expired. Please log in again.', 'TWOFA_EXPIRED');
  }
  if (user.twofa_attempts >= MAX_CODE_ATTEMPTS) {
    throw loginAgain(
      'Too many incorrect codes. Please log in again to get a new code.',
      'TWOFA_LOCKED',
    );
  }

  if (!codesMatch(user.twofa_code_hash, user.user_id, code)) {
    const { twofa_attempts: attempts } = await prisma.user.update({
      where: { user_id: user.user_id },
      data: { twofa_attempts: { increment: 1 } },
      select: { twofa_attempts: true },
    });
    await recordAudit({
      userId: user.user_id,
      action: AUDIT_ACTIONS.TWOFA_FAILED,
      targetType: 'user',
      targetId: user.user_id,
      details: { attempt: attempts },
      ipAddress,
    });

    const remaining = Math.max(0, MAX_CODE_ATTEMPTS - attempts);
    throw ApiError.unauthorized(
      remaining > 0
        ? `Incorrect code. You have ${remaining} attempt${remaining === 1 ? '' : 's'} left.`
        : 'Too many incorrect codes. Please log in again to get a new code.',
      remaining > 0 ? 'INVALID_2FA_CODE' : 'TWOFA_LOCKED',
    );
  }

  // Consume the code atomically so it cannot be used twice, even by two
  // requests arriving at the same moment.
  const { count } = await prisma.user.updateMany({
    where: { user_id: user.user_id, twofa_code_hash: user.twofa_code_hash },
    data: { twofa_code_hash: null, twofa_expires_at: null, twofa_attempts: 0 },
  });
  if (count === 0) {
    throw loginAgain('This code has already been used. Please log in again.', 'TWOFA_EXPIRED');
  }

  return user;
}
