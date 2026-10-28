/**
 * HTTP layer for /events.
 */
import * as eventService from '../services/eventService.js';
import { paginationMeta, sendCreated, sendSuccess } from '../utils/response.js';

export async function list(req, res) {
  const query = req.validated.query;
  const { events, total } = await eventService.listPublicEvents(query);
  sendSuccess(
    res,
    { events },
    { meta: paginationMeta({ page: query.page, pageSize: query.pageSize, total }) },
  );
}

export async function listMine(req, res) {
  const query = req.validated.query;
  const { events, total } = await eventService.listOrganizerEvents(req.user.user_id, query);
  sendSuccess(
    res,
    { events },
    { meta: paginationMeta({ page: query.page, pageSize: query.pageSize, total }) },
  );
}

export async function getById(req, res) {
  const event = await eventService.getEventById(req.validated.params.id, req.user);
  sendSuccess(res, { event });
}

export async function create(req, res) {
  const event = await eventService.createEvent(req.user.user_id, req.validated.body);
  res.locals.auditTargetId = event.event_id; // the audit log records the new event
  sendCreated(res, { event });
}

export async function update(req, res) {
  const event = await eventService.updateEvent({
    eventId: req.validated.params.id,
    organizerId: req.user.user_id,
    data: req.validated.body,
  });
  sendSuccess(res, { event });
}

export async function submit(req, res) {
  const event = await eventService.submitEvent({
    eventId: req.validated.params.id,
    organizerId: req.user.user_id,
  });
  sendSuccess(res, { event, message: 'Event submitted for approval.' });
}

export async function cancel(req, res) {
  const reason = req.validated.body?.reason;
  const { event, notified } = await eventService.cancelEvent({
    eventId: req.validated.params.id,
    user: req.user,
    reason,
  });
  res.locals.auditDetails = { reason, notified };
  sendSuccess(res, {
    event,
    message: `Event cancelled. ${notified} student(s) are being notified.`,
  });
}