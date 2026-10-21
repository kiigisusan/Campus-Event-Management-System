/**
 * HTTP layer for /auth: reads validated input, calls authService, sends the response.
 */
import * as authService from '../services/authService.js';
import * as passwordResetService from '../services/passwordResetService.js';
import * as twoFactorService from '../services/twoFactorService.js';
import { toPublicUser } from '../utils/publicUser.js';
import { sendCreated, sendSuccess } from '../utils/response.js';

/** Request metadata passed to services for the audit trail. */
const contextOf = (req) => ({ ipAddress: req.ip });

export async function register(req, res) {
  const result = await authService.register(req.validated.body, contextOf(req));
  sendCreated(res, result);
}

export async function login(req, res) {
  const result = await authService.login(req.validated.body, contextOf(req));
  sendSuccess(res, result);
}

export async function verifyTwoFactor(req, res) {
  const user = await twoFactorService.verifyLoginCode(req.validated.body, contextOf(req));
  const session = await authService.startSession(user, contextOf(req));
  sendSuccess(res, session);
}

export async function logout(req, res) {
  await authService.logout(req.user.user_id, contextOf(req));
  sendSuccess(res, { message: 'You have been logged out' });
}

export function me(req, res) {
  sendSuccess(res, { user: toPublicUser(req.user) });
}

export async function forgotPassword(req, res) {
  await passwordResetService.requestPasswordReset(req.validated.body.email, contextOf(req));
  // Same answer whether or not the account exists (see requestPasswordReset).
  sendSuccess(res, {
    message: 'If an account exists for that email, we have sent a link to reset the password.',
  });
}

export async function resetPassword(req, res) {
  await passwordResetService.resetPassword(req.validated.body, contextOf(req));
  sendSuccess(res, { message: 'Your password has been changed. You can now log in.' });
}
