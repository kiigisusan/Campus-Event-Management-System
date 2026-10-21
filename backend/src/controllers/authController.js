/**
 * HTTP layer for /auth: reads validated input, calls authService, sends the response.
 */
import * as authService from '../services/authService.js';
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

export async function logout(req, res) {
  await authService.logout(req.user.user_id, contextOf(req));
  sendSuccess(res, { message: 'You have been logged out' });
}

export function me(req, res) {
  sendSuccess(res, { user: toPublicUser(req.user) });
}
