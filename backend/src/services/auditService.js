/**
 * Writes entries to the audit trail (audit_logs).
 */
import { prisma } from '../config/prisma.js';

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
