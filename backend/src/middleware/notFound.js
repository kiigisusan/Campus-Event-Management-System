import { ApiError } from '../utils/ApiError.js';

/** Catches requests that matched no route and passes a 404 to the error handler. */
export function notFound(req, _res, next) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`, 'ROUTE_NOT_FOUND'));
}
