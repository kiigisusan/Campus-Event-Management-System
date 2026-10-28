/**
 * An expected, client-facing error (bad input, not logged in, not found ...).
 *
 * Services throw these; the central error handler turns them into the
 * standard JSON error response. Anything that is NOT an ApiError is treated
 * as an unexpected server bug and returned as a generic 500.
 */
export class ApiError extends Error {
  /**
   * @param {number} statusCode HTTP status code to send.
   * @param {string} code       Stable machine-readable code, e.g. 'EVENT_FULL'.
   * @param {string} message    Human-readable message, safe to show to users.
   * @param {unknown} [details] Optional extra data, e.g. per-field validation errors.
   */
  constructor(statusCode, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }

  static badRequest(message = 'Bad request', details, code = 'BAD_REQUEST') {
    return new ApiError(400, code, message, details);
  }

  static unauthorized(message = 'Please log in to continue', code = 'UNAUTHORIZED') {
    return new ApiError(401, code, message);
  }

  static forbidden(message = 'You do not have permission to do this', code = 'FORBIDDEN') {
    return new ApiError(403, code, message);
  }

  static notFound(message = 'Resource not found', code = 'NOT_FOUND') {
    return new ApiError(404, code, message);
  }

  static conflict(message = 'Conflict', code = 'CONFLICT') {
    return new ApiError(409, code, message);
  }

  static tooManyRequests(message = 'Too many requests, please try again later') {
    return new ApiError(429, 'TOO_MANY_REQUESTS', message);
  }
}
