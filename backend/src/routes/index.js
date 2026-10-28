/**
 * API router: every feature router is mounted here under /api/v1.
 *
 * To add a feature, create `routes/<feature>Routes.js` and add one line below.
 * Keep the list grouped by owner so merges between branches stay simple.
 */
import { Router } from 'express';
import adminEventRoutes from './adminEventRoutes.js';
import auditLogRoutes from './auditLogRoutes.js';
import authRoutes from './authRoutes.js';
import bookingRoutes from './bookingRoutes.js';
import checkInRoutes from './checkInRoutes.js';
import eventRoutes from './eventRoutes.js';
import healthRoutes from './healthRoutes.js';
import paymentRoutes from './paymentRoutes.js';
import reportRoutes from './reportRoutes.js';

const router = Router();

// --- Platform -------------------------------------------------------------
router.use('/health', healthRoutes);

// --- Member 2: auth, bookings, payments, check-in, reports, audit ---------
router.use('/auth', authRoutes);
router.use('/bookings', bookingRoutes);
router.use('/payments', paymentRoutes);
router.use('/check-in', checkInRoutes);
router.use('/reports', reportRoutes);
router.use('/audit-logs', auditLogRoutes);

// --- Member 1: events, categories, venues, admin & organizer APIs ---------
router.use('/events', eventRoutes);
router.use('/admin/events', adminEventRoutes);

export default router;