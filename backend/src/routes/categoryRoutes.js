/**
 * /api/v1/categories (anyone can list; only admins can change)
 */
import { Router } from 'express';
import { AUDIT_ACTIONS } from '../constants/auditActions.js';
import * as controller from '../controllers/referenceDataController.js';
import { audit } from '../middleware/audit.js';
import { authenticate, authorize } from '../middleware/authenticate.js';
import { validate } from '../middleware/validate.js';
import { idParamsSchema } from '../validators/common.js';
import { createCategorySchema, updateCategorySchema } from '../validators/referenceValidators.js';

const router = Router();

router.get('/', controller.listCategories);

router.post(
  '/',
  authenticate,
  authorize('admin'),
  validate({ body: createCategorySchema }),
  audit(AUDIT_ACTIONS.CREATE_CATEGORY, 'category'),
  controller.createCategory,
);

router.patch(
  '/:id',
  authenticate,
  authorize('admin'),
  validate({ params: idParamsSchema(), body: updateCategorySchema }),
  audit(AUDIT_ACTIONS.UPDATE_CATEGORY, 'category'),
  controller.updateCategory,
);

router.delete(
  '/:id',
  authenticate,
  authorize('admin'),
  validate({ params: idParamsSchema() }),
  audit(AUDIT_ACTIONS.DELETE_CATEGORY, 'category'),
  controller.deleteCategory,
);

export default router;