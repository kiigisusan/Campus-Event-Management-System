import { Router } from 'express';
import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/ApiError.js';
import { sendSuccess } from '../utils/response.js';

const router = Router();

/**
 * Liveness check: the process is up and answering requests.
 * Used by Docker and the hosting platform to know the API started.
 */
router.get('/', (_req, res) => {
  sendSuccess(res, {
    status: 'ok',
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

/**
 * Readiness check: the API can also reach the database.
 * Returns 503 while MySQL is down so a load balancer stops sending traffic.
 */
router.get('/ready', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    throw new ApiError(503, 'DATABASE_UNAVAILABLE', 'Database is not reachable');
  }
  sendSuccess(res, { status: 'ready', database: 'up' });
});

export default router;
