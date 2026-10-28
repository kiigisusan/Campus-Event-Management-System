/**
 * /api/v1/admin/events (admins only)
 */
import { Router } from 'express';
import * as adminEventController from '../controllers/adminEventController.js';
import { AUDIT_ACTIONS } from '../constants/auditActions.js';
import { audit } from '../middleware/audit.js';
import { authenticate, authorize } from '../middleware/authenticate.js';
import { validate } from '../middleware/validate.js';
import { listAdminEventsSchema, rejectEventSchema } from '../validators/adminEventValidators.js';
import { idParamsSchema } from '../validators/common.js';

const router = Router();

router.use(authenticate, authorize('admin'));

router.get('/', validate({ query: listAdminEventsSchema }), adminEventController.list);

router.patch(
  '/:id/approve',
  validate({ params: idParamsSchema() }),
  audit(AUDIT_ACTIONS.APPROVE_EVENT, 'event'),
  adminEventController.approve,
);

router.patch(
  '/:id/reject',
  validate({ params: idParamsSchema(), body: rejectEventSchema }),
  audit(AUDIT_ACTIONS.REJECT_EVENT, 'event'),
  adminEventController.reject,
);

export default router;