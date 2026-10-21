/**
 * Zod schemas reused across many routes. Feature-specific schemas live next
 * to their feature (e.g. validators/authValidators.js).
 */
import { z } from 'zod';

/** A positive integer id taken from the URL, e.g. /events/:id. */
export const idParam = z.coerce.number().int().positive();

/** Builds a params schema for routes like /events/:id. */
export const idParamsSchema = (name = 'id') => z.object({ [name]: idParam });

/** Standard ?page=&pageSize= query. Capped at 100 rows to protect the database. */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/** Optional ISO date (YYYY-MM-DD) taken from the query string. */
export const isoDate = z.iso.date({ error: 'Use the date format YYYY-MM-DD' });
