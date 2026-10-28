/**
 * HTTP layer for /admin/events (approval queue).
 */
import * as approvalService from '../services/eventApprovalService.js';
import { paginationMeta, sendSuccess } from '../utils/response.js';

export async function list(req, res) {
  const query = req.validated.query;
  const { events, total } = await approvalService.listEventsByStatus(query);
  sendSuccess(
    res,
    { events },
    { meta: paginationMeta({ page: query.page, pageSize: query.pageSize, total }) },
  );
}

export async function approve(req, res) {
  const event = await approvalService.approveEvent(req.validated.params.id);
  sendSuccess(res, { event, message: 'Event approved. Students can now book it.' });
}

export async function reject(req, res) {
  const { reason } = req.validated.body;
  const event = await approvalService.rejectEvent(req.validated.params.id, reason);
  res.locals.auditDetails = { reason }; // saved in the audit log
  sendSuccess(res, { event, message: 'Event rejected. The organizer can see your reason.' });
}