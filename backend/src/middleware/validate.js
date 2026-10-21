import { ApiError } from '../utils/ApiError.js';

/**
 * Turns Zod issues into a flat list the frontend can map onto form fields:
 *   [{ field: 'email', message: 'Invalid email address' }]
 * @param {import('zod').ZodError} error
 */
export function formatZodIssues(error) {
  return error.issues.map((issue) => ({
    field: issue.path.join('.') || null,
    message: issue.message,
  }));
}

/**
 * Validates parts of the request against Zod schemas.
 *
 * Usage in a route file:
 *   router.post('/events', validate({ body: createEventSchema }), controller.create);
 *
 * Parsed (and coerced/defaulted) values are stored on `req.validated`, e.g.
 * `req.validated.query.page` is a number even though the URL held a string.
 * Controllers should read from `req.validated`, not from `req.query`, because
 * Express 5 makes `req.query` read-only.
 *
 * @param {{ body?: import('zod').ZodType, query?: import('zod').ZodType, params?: import('zod').ZodType }} schemas
 * @returns {import('express').RequestHandler}
 */
export function validate(schemas) {
  return (req, _res, next) => {
    const validated = {};
    const fieldErrors = [];

    for (const part of ['params', 'query', 'body']) {
      const schema = schemas[part];
      if (!schema) continue;

      const result = schema.safeParse(req[part] ?? {});
      if (result.success) {
        validated[part] = result.data;
      } else {
        fieldErrors.push(...formatZodIssues(result.error));
      }
    }

    if (fieldErrors.length > 0) {
      return next(ApiError.badRequest('Some fields are invalid', fieldErrors, 'VALIDATION_ERROR'));
    }

    req.validated = validated;
    // Replace the body with the cleaned version so unknown fields are dropped.
    if (validated.body) req.body = validated.body;
    return next();
  };
}
