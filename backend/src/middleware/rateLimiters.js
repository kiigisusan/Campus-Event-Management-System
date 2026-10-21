/**
 * Rate limits for the endpoints attackers target: login, 2FA and password reset.
 *
 * Why the keys combine IP *and* email: on campus Wi-Fi hundreds of students
 * share one public IP address. A per-IP limit alone would let one person's
 * typos lock the whole campus out, while a per-email limit alone would let an
 * attacker try one password against thousands of accounts. IP + email limits
 * guessing on each account from each network without blocking everyone else.
 *
 * Counters live in memory (express-rate-limit's MemoryStore), which is right
 * for a single API instance. With several instances behind a load balancer,
 * switch to a shared store such as rate-limit-redis.
 */
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { ApiError } from '../utils/ApiError.js';

const MINUTE = 60_000;

/** IPv6 addresses are grouped by /56 subnet so one user cannot rotate through addresses. */
const ipKey = (req) => ipKeyGenerator(req.ip ?? '');

const emailKey = (req) =>
  String(req.body?.email ?? '')
    .trim()
    .toLowerCase();

/**
 * Builds a limiter that answers with our standard JSON error (429) and the
 * standard RateLimit / Retry-After headers so the frontend can say when to retry.
 */
function createLimiter({ windowMs, limit, keyGenerator, message, skipSuccessfulRequests = false }) {
  return rateLimit({
    windowMs,
    limit,
    keyGenerator,
    skipSuccessfulRequests,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) => next(ApiError.tooManyRequests(message)),
  });
}

/** 5 failed logins per account per network every 15 minutes. Successful logins do not count. */
export const loginLimiter = createLimiter({
  windowMs: 15 * MINUTE,
  limit: 5,
  keyGenerator: (req) => `${ipKey(req)}|${emailKey(req)}`,
  skipSuccessfulRequests: true,
  message: 'Too many failed login attempts. Please wait 15 minutes and try again.',
});

/** 2FA code submissions per network (each code is also locked after 5 wrong tries). */
export const twoFactorLimiter = createLimiter({
  windowMs: 15 * MINUTE,
  limit: 20,
  keyGenerator: ipKey,
  skipSuccessfulRequests: true,
  message: 'Too many code attempts. Please wait 15 minutes and try again.',
});

/** 3 reset emails per account per network each hour, so nobody can flood an inbox. */
export const forgotPasswordLimiter = createLimiter({
  windowMs: 60 * MINUTE,
  limit: 3,
  keyGenerator: (req) => `${ipKey(req)}|${emailKey(req)}`,
  message: 'Too many password reset requests. Please wait an hour and try again.',
});

/** Account creation per network; generous because a whole class may register at once. */
export const registerLimiter = createLimiter({
  windowMs: 60 * MINUTE,
  limit: 50,
  keyGenerator: ipKey,
  message: 'Too many accounts created from this network. Please try again later.',
});
