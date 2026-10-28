/**
 * Zod schemas for /categories and /venues.
 */
import { z } from 'zod';

const categoryFields = {
  name: z.string().trim().min(2).max(50),
  description: z.string().trim().max(255).nullish(),
};

const venueFields = {
  name: z.string().trim().min(2).max(100),
  location: z.string().trim().min(2).max(255),
  capacity: z.coerce.number().int().positive().max(100_000),
};

const atLeastOneField = {
  message: 'Send at least one field to update',
};

export const createCategorySchema = z.object(categoryFields);
export const updateCategorySchema = z
  .object(categoryFields)
  .partial()
  .refine((body) => Object.keys(body).length > 0, atLeastOneField);

export const createVenueSchema = z.object(venueFields);
export const updateVenueSchema = z
  .object(venueFields)
  .partial()
  .refine((body) => Object.keys(body).length > 0, atLeastOneField);
  