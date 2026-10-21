/**
 * JWT and random-token helpers.
 */
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

const ISSUER = 'cems-api';
const ALGORITHM = 'HS256';

/** The `type` claim stops a token issued for one purpose being used for another. */
export const TOKEN_TYPES = Object.freeze({
  ACCESS: 'access', // normal logged-in session
  TWOFA: '2fa', // short-lived proof that the password step passed; only usable to submit the 2FA code
});

/**
 * Issues a session token. It expires after SESSION_TIMEOUT_MINUTES, and the
 * authenticate middleware hands out a fresh one while the user stays active,
 * which together give the "log out after 30 minutes of inactivity" rule.
 *
 * `tv` (token version) must match users.token_version; bumping that column
 * on logout or password change invalidates every token issued before.
 *
 * @param {{ user_id: number, role: string, token_version: number }} user
 */
export function signAccessToken(user) {
  return jwt.sign(
    { type: TOKEN_TYPES.ACCESS, role: user.role, tv: user.token_version },
    env.JWT_SECRET,
    {
      algorithm: ALGORITHM,
      issuer: ISSUER,
      subject: String(user.user_id),
      expiresIn: `${env.SESSION_TIMEOUT_MINUTES}m`,
    },
  );
}

/**
 * Issues the short-lived token returned after a correct password when the
 * user still has to enter an emailed 2FA code.
 * @param {{ user_id: number, token_version: number }} user
 */
export function signTwoFactorToken(user) {
  return jwt.sign({ type: TOKEN_TYPES.TWOFA, tv: user.token_version }, env.JWT_SECRET, {
    algorithm: ALGORITHM,
    issuer: ISSUER,
    subject: String(user.user_id),
    expiresIn: `${env.TWOFA_CODE_TTL_MINUTES}m`,
  });
}

/**
 * Verifies signature, issuer, expiry and token type.
 * Throws jsonwebtoken errors (TokenExpiredError, JsonWebTokenError) on failure.
 * @param {string} token
 * @param {string} expectedType One of TOKEN_TYPES.
 */
export function verifyToken(token, expectedType) {
  const payload = jwt.verify(token, env.JWT_SECRET, { algorithms: [ALGORITHM], issuer: ISSUER });
  if (payload.type !== expectedType) {
    throw new jwt.JsonWebTokenError('Wrong token type');
  }
  return payload;
}

/** A cryptographically random, URL-safe token (password reset links, QR codes). */
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');

/** SHA-256 hex digest. Used to store reset tokens so a database leak does not expose live links. */
export const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
