/**
 * Zod schemas for /admin/events.
 */
import { z } from 'zod';
import { paginationSchema } from './common.js';

/** GET /admin/events (the approval queue; shows pending events by default). */
export const listAdminEventsSchema = paginationSchema.extend({
  status: z.enum(['draft', 'pending', 'approved', 'rejected', 'cancelled']).default('pending'),
});

/** PATCH /admin/events/:id/reject (the organizer sees this reason). */
export const rejectEventSchema = z.object({
  reason: z.string().trim().min(5, 'Please give a reason (at least 5 characters)').max(500),
});