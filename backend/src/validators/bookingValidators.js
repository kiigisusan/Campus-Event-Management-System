import { z } from 'zod';
import { idParam, paginationSchema } from './common.js';

export const createBookingSchema = z.object({
  event_id: idParam,
});

export const listMyBookingsSchema = paginationSchema.extend({
  status: z.enum(['pending', 'confirmed', 'cancelled', 'checked_in']).optional(),
});
