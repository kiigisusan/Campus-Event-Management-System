import { Router } from 'express';
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

export default router;
