/**
 * Forgot / reset password by emailed link.
 *
 * Flow:
 *  1. POST /auth/forgot-password { email }
 *     A random token is emailed as a link to the frontend reset page. Only a
 *     SHA-256 hash of it is stored, so someone who reads the database still
 *     cannot use a pending reset link.
 *  2. POST /auth/reset-password { token, password }
 *     The token is valid once, for PASSWORD_RESET_TTL_MINUTES. Resetting also
 *     logs the user out everywhere.
 */
import { env } from '../config/env.js';
import { prisma } from '../config/prisma.js';
import { AUDIT_ACTIONS } from '../constants/auditActions.js';
import { passwordResetEmail } from '../emails/templates.js';
import { ApiError } from '../utils/ApiError.js';
import { runInBackground } from '../utils/background.js';
import { randomToken, sha256 } from '../utils/tokens.js';
import { recordAudit } from './auditService.js';
import { hashPassword } from './authService.js';
import { sendEmail } from './emailService.js';

/**
 * Starts a password reset. Behaves identically whether or not the email is
 * registered (same response, no extra waiting), so this endpoint cannot be
 * used to discover which emails have accounts.
 *
 * @param {string} email
 * @param {{ ipAddress?: string }} context
 */
export async function requestPasswordReset(email, { ipAddress } = {}) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.is_active) return;

  const token = randomToken(32);
  await prisma.user.update({
    where: { user_id: user.user_id },
    data: {
      password_reset_token_hash: sha256(token),
      password_reset_expires_at: new Date(Date.now() + env.PASSWORD_RESET_TTL_MINUTES * 60_000),
    },
  });

  const resetUrl = `${env.CLIENT_URL}/reset-password?token=${encodeURIComponent(token)}`;

  // In the background: waiting for the mail server here would make responses for
  // real accounts measurably slower than for unknown emails.
  runInBackground(`password reset email for user ${user.user_id}`, () =>
    sendEmail({
      to: user.email,
      ...passwordResetEmail({
        name: user.name,
        resetUrl,
        ttlMinutes: env.PASSWORD_RESET_TTL_MINUTES,
      }),
    }),
  );

  await recordAudit({
    userId: user.user_id,
    action: AUDIT_ACTIONS.PASSWORD_RESET_REQUESTED,
    targetType: 'user',
    targetId: user.user_id,
    ipAddress,
  });
}

/**
 * Sets a new password using a reset token.
 *
 * @param {{ token: string, password: string }} input
 * @param {{ ipAddress?: string }} context
 */
export async function resetPassword({ token, password }, { ipAddress } = {}) {
  const tokenHash = sha256(token);
  const invalidLink = ApiError.badRequest(
    'This reset link is invalid or has expired. Please request a new one.',
    undefined,
    'INVALID_RESET_TOKEN',
  );

  const user = await prisma.user.findUnique({ where: { password_reset_token_hash: tokenHash } });
  if (!user) throw invalidLink;

  // The token conditions are repeated in the WHERE clause so that using the
  // token and clearing it happen in one atomic statement: if two requests
  // race with the same link, only one of them can update the row.
  const { count } = await prisma.user.updateMany({
    where: {
      user_id: user.user_id,
      password_reset_token_hash: tokenHash,
      password_reset_expires_at: { gt: new Date() },
    },
    data: {
      password_hash: await hashPassword(password),
      password_reset_token_hash: null,
      password_reset_expires_at: null,
      // Log out every existing session: whoever knew the old password is locked out.
      token_version: { increment: 1 },
    },
  });
  if (count === 0) throw invalidLink;

  await recordAudit({
    userId: user.user_id,
    action: AUDIT_ACTIONS.PASSWORD_RESET_COMPLETED,
    targetType: 'user',
    targetId: user.user_id,
    ipAddress,
  });
}
