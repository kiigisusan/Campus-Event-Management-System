/**
 * /api/v1/admin/users (admins only)
 */
import { Router } from 'express';
import { AUDIT_ACTIONS } from '../constants/auditActions.js';
import * as adminUserController from '../controllers/adminUserController.js';
import { audit } from '../middleware/audit.js';
import { authenticate, authorize } from '../middleware/authenticate.js';
import { validate } from '../middleware/validate.js';
import {
  changeRoleSchema,
  createUserSchema,
  listUsersSchema,
  updateUserSchema,
} from '../validators/adminUserValidators.js';
import { idParamsSchema } from '../validators/common.js';

const router = Router();

router.use(authenticate, authorize('admin'));

router.get('/', validate({ query: listUsersSchema }), adminUserController.list);

router.post(
  '/',
  validate({ body: createUserSchema }),
  audit(AUDIT_ACTIONS.CREATE_USER, 'user'),
  adminUserController.create,
);

router.get('/:id', validate({ params: idParamsSchema() }), adminUserController.getById);

router.patch(
  '/:id',
  validate({ params: idParamsSchema(), body: updateUserSchema }),
  audit(AUDIT_ACTIONS.UPDATE_USER, 'user'),
  adminUserController.update,
);

router.patch(
  '/:id/role',
  validate({ params: idParamsSchema(), body: changeRoleSchema }),
  audit(AUDIT_ACTIONS.CHANGE_ROLE, 'user'),
  adminUserController.changeRole,
);

router.patch(
  '/:id/deactivate',
  validate({ params: idParamsSchema() }),
  audit(AUDIT_ACTIONS.DEACTIVATE_USER, 'user'),
  adminUserController.deactivate,
);

router.patch(
  '/:id/activate',
  validate({ params: idParamsSchema() }),
  audit(AUDIT_ACTIONS.ACTIVATE_USER, 'user'),
  adminUserController.activate,
);

router.post(
  '/:id/reset-password',
  validate({ params: idParamsSchema() }),
  audit(AUDIT_ACTIONS.ADMIN_RESET_PASSWORD, 'user'),
  adminUserController.resetPassword,
);

export default router;