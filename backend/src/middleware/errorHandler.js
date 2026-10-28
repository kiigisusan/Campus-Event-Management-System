import { ZodError } from 'zod';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { formatZodIssues } from './validate.js';

/**
 * Maps known Prisma error codes to client-facing errors.
 * Full list: https://www.prisma.io/docs/orm/reference/error-reference
 *
 * Checked by name rather than `instanceof` so this file does not need to
 * import the Prisma client.
 * @param {any} err
 * @returns {ApiError | null}
 */
function fromPrismaError(err) {
  if (err?.name !== 'PrismaClientKnownRequestError') return null;

  switch (err.code) {
    case 'P2002': {
      // Unique constraint failed, e.g. an email that is already registered.
      const target = err.meta?.target;
      const fields = Array.isArray(target) ? target.join(', ') : target;
      return ApiError.conflict(
        fields ? `A record with this ${fields} already exists` : 'This record already exists',
        'DUPLICATE',
      );
    }
    case 'P2003':
      // Foreign key failed: the referenced row is missing, or the row is still in use.
      return ApiError.conflict(
        'This action conflicts with related records (it may still be in use)',
        'FOREIGN_KEY_CONFLICT',
      );
    case 'P2025':
      return ApiError.notFound('The requested record was not found');
    default:
      return null;
  }
}

/**
 * Central error handler: the single place that turns any thrown error into
 * the standard JSON error response:
 *
 *   { "success": false, "error": { "code": "...", "message": "...", "details": ... } }
 *
 * Express 5 forwards errors thrown in async handlers here automatically, so
 * controllers do not need try/catch blocks.
 *
 * Express recognises an error handler by its 4 parameters, so `_next` must stay.
 *
 * @type {import('express').ErrorRequestHandler}
 */
export function errorHandler(err, req, res, _next) {
  let apiError;

  if (err instanceof ApiError) {
    apiError = err;
  } else if (err instanceof ZodError) {
    apiError = ApiError.badRequest(
      'Some fields are invalid',
      formatZodIssues(err),
      'VALIDATION_ERROR',
    );
  } else if (err?.type === 'entity.parse.failed') {
    // Raised by express.json() when the request body is not valid JSON.
    apiError = ApiError.badRequest('Request body is not valid JSON', undefined, 'INVALID_JSON');
  } else if (err?.type === 'entity.too.large') {
    apiError = new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
  } else {
    apiError = fromPrismaError(err);
  }

  if (!apiError) {
    // Unexpected error: log everything server-side, reveal nothing sensitive to the client.
    console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`, err);
    apiError = new ApiError(
      500,
      'INTERNAL_ERROR',
      env.isProduction ? 'Something went wrong. Please try again later.' : err?.message || 'Error',
    );
  }

  const body = { success: false, error: { code: apiError.code, message: apiError.message } };
  if (apiError.details !== undefined) body.error.details = apiError.details;

  res.status(apiError.statusCode).json(body);
}
