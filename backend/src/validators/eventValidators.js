/**
 * Zod schemas for /events.
 */
import { z } from 'zod';
import { isoDate, paginationSchema } from './common.js';

const positiveInt = z.coerce.number().int().positive();
const timeHHMM = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use the time format HH:MM (24-hour)');

const eventFields = {
  title: z.string().trim().min(3).max(150),
  description: z.string().trim().min(10).max(5000),
  event_date: isoDate,
  event_time: timeHHMM,
  venue_id: positiveInt,
  capacity: positiveInt,
  price: z.coerce.number().min(0).max(1_000_000),
  category_id: positiveInt,
  image_url: z.url().max(500).nullish(),
};

/** POST /events (price defaults to 0 = free). */
export const createEventSchema = z.object({
  ...eventFields,
  price: eventFields.price.default(0),
});

/** PATCH /events/:id (send only the fields that change). */
export const updateEventSchema = z
  .object(eventFields)
  .partial()
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Send at least one field to update',
  });

/** PATCH /events/:id/cancel (the reason is optional). */
export const cancelEventSchema = z
  .object({ reason: z.string().trim().max(500).optional() })
  .optional();

/** GET /events (public list with search and filters). */
export const listEventsSchema = paginationSchema.extend({
  search: z.string().trim().max(100).optional(),
  category_id: positiveInt.optional(),
  venue_id: positiveInt.optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  free: z.enum(['true', 'false']).optional(),
  sort: z.enum(['date', 'price', 'title']).default('date'),
  order: z.enum(['asc', 'desc']).default('asc'),
});

/** GET /events/mine (organizer's own events). */
export const listMyEventsSchema = paginationSchema.extend({
  status: z.enum(['draft', 'pending', 'approved', 'rejected', 'cancelled']).optional(),
});