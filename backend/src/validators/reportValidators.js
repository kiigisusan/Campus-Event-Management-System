/**
 * Query-string filters for /reports and /audit-logs.
 * Every sort option is a fixed list, so user input never reaches ORDER BY as text.
 */
import { z } from 'zod';
import { AUDIT_ACTIONS } from '../constants/auditActions.js';
import { idParam, isoDate, paginationSchema } from './common.js';

const dateRange = {
  from: isoDate.optional(),
  to: isoDate.optional(),
};

/** ISO dates compare correctly as strings. */
const fromBeforeTo = (filters) => !filters.from || !filters.to || filters.from <= filters.to;
const fromBeforeToError = {
  message: 'The start date must be on or before the end date',
  path: ['to'],
};

const reportFilters = {
  ...dateRange,
  category_id: idParam.optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
};

export const attendanceReportSchema = z
  .object({
    ...reportFilters,
    sort: z
      .enum(['date', 'title', 'bookings', 'checked_in', 'attendance_rate', 'revenue'])
      .default('date'),
    group_by: z.enum(['day', 'week', 'month']).default('month'),
  })
  .refine(fromBeforeTo, fromBeforeToError);

export const categoryReportSchema = z
  .object({
    ...reportFilters,
    sort: z
      .enum(['name', 'events', 'bookings', 'checked_in', 'attendance_rate', 'revenue'])
      .default('bookings'),
  })
  .refine(fromBeforeTo, fromBeforeToError);

export const organizerReportSchema = z
  .object({
    ...reportFilters,
    sort: z.enum(['name', 'events', 'bookings', 'checked_in', 'revenue']).default('events'),
  })
  .refine(fromBeforeTo, fromBeforeToError);

const auditFilters = {
  ...dateRange,
  user_id: idParam.optional(),
  action: z.enum(Object.values(AUDIT_ACTIONS)).optional(),
  target_type: z.string().trim().max(50).optional(),
  // Matches the acting user's name or email.
  search: z.string().trim().max(100).optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
};

export const auditLogQuerySchema = paginationSchema
  .extend(auditFilters)
  .refine(fromBeforeTo, fromBeforeToError);

export const auditLogExportSchema = z.object(auditFilters).refine(fromBeforeTo, fromBeforeToError);
