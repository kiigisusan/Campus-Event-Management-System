/**
 * Writes and reads the audit trail (audit_logs).
 */
import { prisma } from '../config/prisma.js';
import { eatDayBounds } from '../utils/eventTime.js';

/**
 * @typedef {object} AuditEntry
 * @property {number | null} [userId]     Who did it. null for system jobs or unknown users.
 * @property {string} action              One of AUDIT_ACTIONS.
 * @property {string} targetType          'user' | 'event' | 'booking' | 'payment' | ...
 * @property {number | null} [targetId]   Id of the affected row, if any.
 * @property {object} [details]           Extra context, e.g. { reason: '...' }. Never put passwords or tokens here.
 * @property {string | null} [ipAddress]
 */

/**
 * Records one audit entry.
 *
 * - Inside a transaction, pass `{ tx }`: the entry is then saved or rolled
 *   back together with the change it describes, and errors propagate.
 * - Without `tx`, a failure to write the log is logged to the console but does
 *   not fail the user's request (the action itself already succeeded).
 *
 * @param {AuditEntry} entry
 * @param {{ tx?: import('@prisma/client').Prisma.TransactionClient }} [options]
 */
export async function recordAudit(entry, { tx } = {}) {
  const data = {
    user_id: entry.userId ?? null,
    action: entry.action,
    target_type: entry.targetType,
    target_id: entry.targetId ?? null,
    details: entry.details ?? undefined,
    ip_address: entry.ipAddress ? String(entry.ipAddress).slice(0, 45) : null,
  };

  if (tx) {
    return tx.auditLog.create({ data });
  }

  try {
    return await prisma.auditLog.create({ data });
  } catch (error) {
    console.error(`Failed to write audit log for ${entry.action}:`, error);
    return null;
  }
}

/** Most rows a single audit-log PDF may contain. */
export const AUDIT_EXPORT_LIMIT = 2000;

/**
 * Builds the Prisma `where` for the audit log filters.
 * Dates are Kenyan calendar days; `to` includes the whole day.
 * @param {{ from?: string, to?: string, user_id?: number, action?: string,
 *           target_type?: string, search?: string }} filters
 */
function auditWhere({ from, to, user_id: userId, action, target_type: targetType, search }) {
  const timestamp = {};
  if (from) timestamp.gte = eatDayBounds(from).start;
  if (to) timestamp.lt = eatDayBounds(to).end;

  return {
    ...(userId ? { user_id: userId } : {}),
    ...(action ? { action } : {}),
    ...(targetType ? { target_type: targetType } : {}),
    ...(from || to ? { timestamp } : {}),
    // The column collation is case-insensitive, so `contains` matches any case.
    ...(search
      ? { user: { OR: [{ name: { contains: search } }, { email: { contains: search } }] } }
      : {}),
  };
}

const presentLog = (log) => ({
  log_id: log.log_id,
  timestamp: log.timestamp,
  action: log.action,
  target_type: log.target_type,
  target_id: log.target_id,
  details: log.details,
  ip_address: log.ip_address,
  user: log.user, // null = system action (e.g. the payment-expiry job) or unknown user
});

const LOG_INCLUDE = { user: { select: { user_id: true, name: true, email: true, role: true } } };

/**
 * One page of the audit trail, newest first by default.
 * @param {object} query Validated auditLogQuerySchema data.
 */
export async function listAuditLogs({ page, pageSize, order, ...filters }) {
  const where = auditWhere(filters);
  const [logs, total] = await prisma.$transaction([
    prisma.auditLog.findMany({
      where,
      include: LOG_INCLUDE,
      orderBy: [{ timestamp: order }, { log_id: order }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.auditLog.count({ where }),
  ]);
  return { logs: logs.map(presentLog), total };
}

/**
 * Up to AUDIT_EXPORT_LIMIT matching entries for the PDF export.
 * @param {object} query Validated auditLogExportSchema data.
 */
export async function exportAuditLogs({ order, ...filters }) {
  const where = auditWhere(filters);
  const [logs, total] = await prisma.$transaction([
    prisma.auditLog.findMany({
      where,
      include: LOG_INCLUDE,
      orderBy: [{ timestamp: order }, { log_id: order }],
      take: AUDIT_EXPORT_LIMIT,
    }),
    prisma.auditLog.count({ where }),
  ]);
  return { logs: logs.map(presentLog), total, truncated: total > logs.length };
}
