/**
 * Authentication business logic: registration, login and logout.
 */
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { prisma } from '../config/prisma.js';
import { AUDIT_ACTIONS } from '../constants/auditActions.js';
import { ApiError } from '../utils/ApiError.js';
import { toPublicUser } from '../utils/publicUser.js';
import { signAccessToken } from '../utils/tokens.js';
import { recordAudit } from './auditService.js';
import { requiresTwoFactor, sendLoginCode } from './twoFactorService.js';

/**
 * Compared against when the email does not exist, so a login for an unknown
 * email takes as long as one for a real account. Without this, response time
 * would reveal which emails are registered.
 */
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('not-a-real-password', env.BCRYPT_ROUNDS);

/** @param {string} password */
export const hashPassword = (password) => bcrypt.hash(password, env.BCRYPT_ROUNDS);

/**
 * @typedef {{ ipAddress?: string }} RequestContext
 */

/**
 * Creates a student or organizer account and logs the user in straight away.
 *
 * @param {object} input Validated registerSchema data.
 * @param {RequestContext} context
 * @returns {Promise<{ token: string, user: object }>}
 */
export async function register(input, { ipAddress } = {}) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw ApiError.conflict('An account with this email already exists', 'EMAIL_TAKEN');
  }

  if (input.role === 'student') {
    const sameStudentId = await prisma.user.findUnique({
      where: { student_id_number: input.student_id_number },
    });
    if (sameStudentId) {
      throw ApiError.conflict('An account with this student ID already exists', 'STUDENT_ID_TAKEN');
    }
  }

  const { password, ...profile } = input;
  const user = await prisma.user.create({
    data: {
      ...profile,
      password_hash: await hashPassword(password),
      // Organizers start unverified; an admin can verify them later.
      verified: false,
    },
  });

  await recordAudit({
    userId: user.user_id,
    action: AUDIT_ACTIONS.REGISTER,
    targetType: 'user',
    targetId: user.user_id,
    details: { role: user.role },
    ipAddress,
  });

  return { token: signAccessToken(user), user: toPublicUser(user) };
}

/**
 * Checks email and password.
 *
 * - Roles without 2FA get a session straight away:
 *     { twoFactorRequired: false, token, user }
 * - Roles in TWOFA_ROLES (admins) are emailed a code instead and must call
 *   POST /auth/2fa/verify:
 *     { twoFactorRequired: true, twoFactorToken, sentTo, expiresInMinutes }
 *
 * Wrong email and wrong password give the same error, so the response never
 * tells an attacker whether an email is registered.
 *
 * @param {{ email: string, password: string }} credentials
 * @param {RequestContext} context
 */
export async function login({ email, password }, { ipAddress } = {}) {
  const user = await prisma.user.findUnique({ where: { email } });
  const passwordMatches = await bcrypt.compare(
    password,
    user?.password_hash ?? DUMMY_PASSWORD_HASH,
  );

  if (!user || !passwordMatches) {
    await recordAudit({
      userId: user?.user_id ?? null,
      action: AUDIT_ACTIONS.LOGIN_FAILED,
      targetType: 'user',
      targetId: user?.user_id ?? null,
      details: { email },
      ipAddress,
    });
    throw ApiError.unauthorized('Incorrect email or password', 'INVALID_CREDENTIALS');
  }

  // Checked only after the password, so it cannot be used to probe for accounts.
  if (!user.is_active) {
    throw ApiError.forbidden(
      'This account has been deactivated. Contact an administrator.',
      'ACCOUNT_DISABLED',
    );
  }

  if (requiresTwoFactor(user)) {
    return sendLoginCode(user, { ipAddress });
  }

  return { twoFactorRequired: false, ...(await startSession(user, { ipAddress })) };
}

/**
 * Issues the session token for a fully authenticated user and audits the login.
 * @param {import('@prisma/client').User} user
 * @param {RequestContext} context
 */
export async function startSession(user, { ipAddress } = {}) {
  await recordAudit({
    userId: user.user_id,
    action: AUDIT_ACTIONS.LOGIN_SUCCESS,
    targetType: 'user',
    targetId: user.user_id,
    ipAddress,
  });
  return { token: signAccessToken(user), user: toPublicUser(user) };
}

/**
 * Ends the session by bumping token_version, which invalidates every token
 * issued to this user so far (on all devices).
 *
 * @param {number} userId
 * @param {RequestContext} context
 */
export async function logout(userId, { ipAddress } = {}) {
  await prisma.user.update({
    where: { user_id: userId },
    data: { token_version: { increment: 1 } },
  });
  await recordAudit({
    userId,
    action: AUDIT_ACTIONS.LOGOUT,
    targetType: 'user',
    targetId: userId,
    ipAddress,
  });
}
