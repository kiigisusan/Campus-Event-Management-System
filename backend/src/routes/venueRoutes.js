/**
 * /api/v1/venues (anyone can list; only admins can change)
 */
import { Router } from 'express';
import { AUDIT_ACTIONS } from '../constants/auditActions.js';
import * as controller from '../controllers/referenceDataController.js';
import { audit } from '../middleware/audit.js';
import { authenticate, authorize } from '../middleware/authenticate.js';
import { validate } from '../middleware/validate.js';
import { idParamsSchema } from '../validators/common.js';
import { createVenueSchema, updateVenueSchema } from '../validators/referenceValidators.js';

const router = Router();

router.get('/', controller.listVenues);

router.post(
  '/',
  authenticate,
  authorize('admin'),
  validate({ body: createVenueSchema }),
  audit(AUDIT_ACTIONS.CREATE_VENUE, 'venue'),
  controller.createVenue,
);

router.patch(
  '/:id',
  authenticate,
  authorize('admin'),
  validate({ params: idParamsSchema(), body: updateVenueSchema }),
  audit(AUDIT_ACTIONS.UPDATE_VENUE, 'venue'),
  controller.updateVenue,
);

router.delete(
  '/:id',
  authenticate,
  authorize('admin'),
  validate({ params: idParamsSchema() }),
  audit(AUDIT_ACTIONS.DELETE_VENUE, 'venue'),
  controller.deleteVenue,
);

export default router;