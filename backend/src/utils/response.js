/**
 * Helpers that keep every successful response in the same shape:
 *
 *   { "success": true, "data": ..., "meta": { ... } }
 *
 * Errors use { "success": false, "error": { code, message, details } } and are
 * produced only by the central error handler (see middleware/errorHandler.js).
 */

/**
 * Sends a success response.
 * @param {import('express').Response} res
 * @param {unknown} data
 * @param {{ status?: number, meta?: object }} [options]
 */
export function sendSuccess(res, data, { status = 200, meta } = {}) {
  const body = { success: true, data };
  if (meta) body.meta = meta;
  return res.status(status).json(body);
}

/**
 * Sends a 201 Created response.
 * @param {import('express').Response} res
 * @param {unknown} data
 */
export function sendCreated(res, data) {
  return sendSuccess(res, data, { status: 201 });
}

/**
 * Builds pagination metadata for list endpoints.
 * @param {{ page: number, pageSize: number, total: number }} params
 */
export function paginationMeta({ page, pageSize, total }) {
  return { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}
