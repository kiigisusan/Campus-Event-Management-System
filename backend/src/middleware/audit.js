import { recordAudit } from '../services/auditService.js';

/**
 * Route middleware that writes an audit entry once the request has
 * SUCCEEDED (status < 400). Failed or rejected requests are not logged as if
 * they happened.
 *
 * Place it after `authenticate` so the acting user is known:
 *
 *   router.patch(
 *     '/:id/approve',
 *     authenticate,
 *     authorize('admin'),
 *     validate({ params: idParamsSchema() }),
 *     audit(AUDIT_ACTIONS.APPROVE_EVENT, 'event'),
 *     controller.approve,
 *   );
 *
 * By default the target id is `req.params.id`. Override with `targetId`, and
 * add context with `details`, e.g. `{ details: (req) => ({ reason: req.body.reason }) }`.
 * A controller can also set `res.locals.auditTargetId` (e.g. the id of a row
 * it just created) and `res.locals.auditDetails`.
 *
 * Use recordAudit() directly instead when the log must be part of a database
 * transaction (bookings, payments) or when there is no logged-in user (login).
 *
 * @param {string} action     One of AUDIT_ACTIONS.
 * @param {string} targetType e.g. 'event', 'user'.
 * @param {{ targetId?: (req: import('express').Request) => number | null,
 *           details?: (req: import('express').Request) => object | undefined }} [options]
 * @returns {import('express').RequestHandler}
 */
export function audit(action, targetType, options = {}) {
  return (req, res, next) => {
    res.on('finish', () => {
      if (res.statusCode >= 400) return;

      const targetId =
        res.locals.auditTargetId ??
        (options.targetId ? options.targetId(req) : Number(req.params.id) || null);

      recordAudit({
        userId: req.user?.user_id ?? null,
        action,
        targetType,
        targetId,
        details: res.locals.auditDetails ?? options.details?.(req),
        ipAddress: req.ip,
      });
    });
    next();
  };
}
