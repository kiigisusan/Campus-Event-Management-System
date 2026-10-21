/**
 * /api/v1/audit-logs - admin only.
 *
 *   GET /audit-logs          ?from&to&user_id&action&target_type&search&order&page&pageSize
 *   GET /audit-logs/actions  action names for the filter dropdown
 *   GET /audit-logs/pdf      same filters (no paging), as a PDF
 */
import { Router } from 'express';
import * as auditLogController from '../controllers/auditLogController.js';
import { authenticate, authorize } from '../middleware/authenticate.js';
import { validate } from '../middleware/validate.js';
import { auditLogExportSchema, auditLogQuerySchema } from '../validators/reportValidators.js';

const router = Router();

router.use(authenticate, authorize('admin'));

router.get('/', validate({ query: auditLogQuerySchema }), auditLogController.list);
router.get('/actions', auditLogController.actions);
router.get('/pdf', validate({ query: auditLogExportSchema }), auditLogController.exportPdf);

export default router;
