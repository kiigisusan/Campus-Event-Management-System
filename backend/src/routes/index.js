/**
 * API router: every feature router is mounted here under /api/v1.
 *
 * To add a feature, create `routes/<feature>Routes.js` and add one line below.
 * Keep the list grouped by owner so merges between branches stay simple.
 */
import { Router } from 'express';
import authRoutes from './authRoutes.js';
import bookingRoutes from './bookingRoutes.js';
import healthRoutes from './healthRoutes.js';
import paymentRoutes from './paymentRoutes.js';

const router = Router();

// --- Platform -------------------------------------------------------------
router.use('/health', healthRoutes);

// --- Member 2: auth, bookings, payments, check-in, reports, audit ---------
router.use('/auth', authRoutes);
router.use('/bookings', bookingRoutes);
router.use('/payments', paymentRoutes);

// --- Member 1: events, categories, venues, admin & organizer APIs ---------

export default router;
