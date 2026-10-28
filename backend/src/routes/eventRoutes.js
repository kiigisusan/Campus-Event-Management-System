/**
 * /api/v1/events
 */
import { Router } from 'express';
import * as eventController from '../controllers/eventController.js';
import { AUDIT_ACTIONS } from '../constants/auditActions.js';
import { audit } from '../middleware/audit.js';
import { authenticate, authorize } from '../middleware/authenticate.js';
import { validate } from '../middleware/validate.js';
import { idParamsSchema } from '../validators/common.js';
import {
  cancelEventSchema,
  createEventSchema,
  listEventsSchema,
  listMyEventsSchema,
  updateEventSchema,
} from '../validators/eventValidators.js';

const router = Router();

/** Logs the user in if a token was sent, but lets anonymous visitors through. */
const optionalAuthenticate = (req, res, next) =>
  req.get('authorization') ? authenticate(req, res, next) : next();

// Public
router.get('/', validate({ query: listEventsSchema }), eventController.list);

// Organizer (must come before '/:id' so "mine" is not read as an id)
router.get(
  '/mine',
  authenticate,
  authorize('organizer'),
  validate({ query: listMyEventsSchema }),
  eventController.listMine,
);

router.get(
  '/:id',
  optionalAuthenticate,
  validate({ params: idParamsSchema() }),
  eventController.getById,
);

router.post(
  '/',
  authenticate,
  authorize('organizer'),
  validate({ body: createEventSchema }),
  audit(AUDIT_ACTIONS.CREATE_EVENT, 'event'),
  eventController.create,
);

router.patch(
  '/:id',
  authenticate,
  authorize('organizer'),
  validate({ params: idParamsSchema(), body: updateEventSchema }),
  audit(AUDIT_ACTIONS.UPDATE_EVENT, 'event'),
  eventController.update,
);

router.patch(
  '/:id/submit',
  authenticate,
  authorize('organizer'),
  validate({ params: idParamsSchema() }),
  audit(AUDIT_ACTIONS.SUBMIT_EVENT, 'event'),
  eventController.submit,
);

router.patch(
  '/:id/cancel',
  authenticate,
  authorize('organizer', 'admin'),
  validate({ params: idParamsSchema(), body: cancelEventSchema }),
  audit(AUDIT_ACTIONS.CANCEL_EVENT, 'event'),
  eventController.cancel,
);

export default router;