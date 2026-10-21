/**
 * /api/v1/reports - admin only.
 *
 *   GET /reports/attendance          GET /reports/attendance/pdf
 *   GET /reports/categories          GET /reports/categories/pdf
 *   GET /reports/organizers          GET /reports/organizers/pdf
 *
 * Shared query filters: from, to (YYYY-MM-DD, on event date), category_id,
 * sort, order (asc|desc). Attendance also takes group_by (day|week|month).
 */
import { Router } from 'express';
import { reportJson, reportPdf } from '../controllers/reportController.js';
import { authenticate, authorize } from '../middleware/authenticate.js';
import { validate } from '../middleware/validate.js';
import {
  attendanceReportSchema,
  categoryReportSchema,
  organizerReportSchema,
} from '../validators/reportValidators.js';

const router = Router();

router.use(authenticate, authorize('admin'));

const REPORT_SCHEMAS = {
  attendance: attendanceReportSchema,
  categories: categoryReportSchema,
  organizers: organizerReportSchema,
};

for (const [type, schema] of Object.entries(REPORT_SCHEMAS)) {
  router.get(`/${type}`, validate({ query: schema }), reportJson(type));
  router.get(`/${type}/pdf`, validate({ query: schema }), reportPdf(type));
}

export default router;
