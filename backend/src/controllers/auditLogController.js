/**
 * HTTP layer for /audit-logs (admin only).
 */
import { AUDIT_ACTIONS } from '../constants/auditActions.js';
import * as auditService from '../services/auditService.js';
import { writeReportPdf } from '../services/pdf/reportPdf.js';
import { formatEat } from '../utils/eventTime.js';
import { paginationMeta, sendSuccess } from '../utils/response.js';

/** GET /audit-logs - filtered, paginated audit trail. */
export async function list(req, res) {
  const query = req.validated.query;
  const { logs, total } = await auditService.listAuditLogs(query);
  sendSuccess(
    res,
    { logs },
    { meta: paginationMeta({ page: query.page, pageSize: query.pageSize, total }) },
  );
}

/** GET /audit-logs/actions - every action name, for the filter dropdown. */
export function actions(_req, res) {
  sendSuccess(res, { actions: Object.values(AUDIT_ACTIONS).sort() });
}

const AUDIT_COLUMNS = [
  { label: 'Time (EAT)', value: (log) => formatEat(log.timestamp), width: 1.4 },
  { label: 'User', value: (log) => (log.user ? log.user.name : 'System'), width: 1.5 },
  { label: 'Role', value: (log) => log.user?.role ?? '-', width: 0.8 },
  { label: 'Action', value: (log) => log.action, width: 1.8 },
  {
    label: 'Target',
    value: (log) => `${log.target_type}${log.target_id ? ` #${log.target_id}` : ''}`,
    width: 1.1,
  },
  {
    label: 'Details',
    value: (log) => (log.details ? JSON.stringify(log.details) : ''),
    width: 2.8,
  },
  { label: 'IP address', value: (log) => log.ip_address, width: 1.1 },
];

/** GET /audit-logs/pdf - the filtered trail as a PDF (latest AUDIT_EXPORT_LIMIT entries). */
export async function exportPdf(req, res) {
  const filters = req.validated.query;
  const { logs, total, truncated } = await auditService.exportAuditLogs(filters);

  await auditService.recordAudit({
    userId: req.user.user_id,
    action: AUDIT_ACTIONS.EXPORT_REPORT,
    targetType: 'report',
    details: { report: 'audit_log', filters, rows: logs.length },
    ipAddress: req.ip,
  });

  const filterPairs = [
    ['From', filters.from],
    ['To', filters.to],
    ['Action', filters.action],
    ['Target', filters.target_type],
    ['User id', filters.user_id],
    ['Search', filters.search],
  ].filter(([, value]) => value !== undefined && value !== '');

  const today = new Date().toISOString().slice(0, 10);
  res.type('pdf');
  res.set('Content-Disposition', `attachment; filename="cems-audit-log-${today}.pdf"`);
  writeReportPdf(res, {
    title: 'Audit Log',
    generatedBy: req.user.name,
    filters: filterPairs,
    summary: [['Entries', truncated ? `${logs.length} of ${total} (latest shown)` : String(total)]],
    columns: AUDIT_COLUMNS,
    rows: logs,
  });
}
