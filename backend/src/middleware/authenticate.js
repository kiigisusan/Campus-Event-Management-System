import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/ApiError.js';
import { USER_SAFE_SELECT, isSuperAdmin } from '../utils/publicUser.js';
import { TOKEN_TYPES, signAccessToken, verifyToken } from '../utils/tokens.js';

/**
 * Response header carrying a renewed session token. The frontend should
 * replace its stored token whenever this header is present.
 */
export const RENEWED_TOKEN_HEADER = 'X-Access-Token';

/** Renew at most once a minute, not on every single request. */
const RENEW_AFTER_SECONDS = 60;

/**
 * Requires a valid session: `Authorization: Bearer <token>`.
 *
 * On success sets `req.user` (safe fields only, see USER_SAFE_SELECT).
 *
 * Inactivity timeout: tokens expire SESSION_TIMEOUT_MINUTES after they are
 * issued, and every authenticated request returns a renewed token in the
 * X-Access-Token header. A user who keeps using the app stays logged in; one
 * who is idle for 30 minutes holds an expired token and must log in again.
 *
 * The user is re-loaded from the database on each request so that
 * deactivation, logout and password changes take effect immediately.
 *
 * @type {import('express').RequestHandler}
 */
export async function authenticate(req, res, next) {
  const [scheme, token] = (req.get('authorization') ?? '').split(' ');
  if (scheme !== 'Bearer' || !token) {
    throw ApiError.unauthorized('Please log in to continue');
  }

  let payload;
  try {
    payload = verifyToken(token, TOKEN_TYPES.ACCESS);
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw ApiError.unauthorized(
        `Your session expired after ${env.SESSION_TIMEOUT_MINUTES} minutes of inactivity. Please log in again.`,
        'SESSION_EXPIRED',
      );
    }
    throw ApiError.unauthorized('Your session is not valid. Please log in again.', 'INVALID_TOKEN');
  }

  const user = await prisma.user.findUnique({
    where: { user_id: Number(payload.sub) },
    select: { ...USER_SAFE_SELECT, token_version: true },
  });

  // token_version changes on logout and password change, which revokes older tokens.
  if (!user || user.token_version !== payload.tv) {
    throw ApiError.unauthorized('Your session has ended. Please log in again.', 'SESSION_REVOKED');
  }
  if (!user.is_active) {
    throw ApiError.unauthorized(
      'This account has been deactivated. Contact an administrator.',
      'ACCOUNT_DISABLED',
    );
  }

  const tokenAgeSeconds = Math.floor(Date.now() / 1000) - payload.iat;
  if (tokenAgeSeconds >= RENEW_AFTER_SECONDS) {
    res.set(RENEWED_TOKEN_HEADER, signAccessToken(user));
  }

  req.user = user;
  next();
}

/**
 * Allows the request only for the given roles. Use after `authenticate`.
 *
 *   authorize('admin')                 admins (including super admins)
 *   authorize('organizer', 'admin')    organizers or admins
 *   authorize('super_admin')           super admins only
 *
 * @param {...('student' | 'organizer' | 'admin' | 'super_admin')} allowedRoles
 * @returns {import('express').RequestHandler}
 */
export function authorize(...allowedRoles) {
  return (req, _res, next) => {
    if (!req.user) {
      return next(ApiError.unauthorized());
    }

    const userRoles = [req.user.role];
    if (isSuperAdmin(req.user)) userRoles.push('super_admin');

    if (!allowedRoles.some((role) => userRoles.includes(role))) {
      return next(ApiError.forbidden('You do not have permission to do this'));
    }
    return next();
  };
}
