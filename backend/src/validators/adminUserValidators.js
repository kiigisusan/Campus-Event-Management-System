/**
 * Zod schemas for /admin/users.
 */
import { z } from 'zod';
import { paginationSchema } from './common.js';

/** GET /admin/users (search by name, email, student ID or organisation). */
export const listUsersSchema = paginationSchema.extend({
  search: z.string().trim().max(100).optional(),
  role: z.enum(['student', 'organizer', 'admin']).optional(),
  is_active: z.enum(['true', 'false']).optional(),
});