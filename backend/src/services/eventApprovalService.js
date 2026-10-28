/**
 * Admin approval of events: the queue, approve and reject.
 *
 * Status flow: pending -> approved / rejected. A rejected event goes back to
 * draft when its organizer edits it (see eventService.updateEvent).
 */
import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/ApiError.js';
import { hasEventStarted } from '../utils/eventTime.js';

const EVENT_INCLUDE = {
  venue: { select: { venue_id: true, name: true, location: true, capacity: true } },
  category: { select: { category_id: true, name: true } },
  organizer: {
    select: { user_id: true, name: true, email: true, org_name: true, verified: true },
  },
};

function serialize(event) {
  const { event_date: date, event_time: time, price, ...rest } = event;
  return {
    ...rest,
    event_date: date.toISOString().slice(0, 10),
    event_time: time.toISOString().slice(11, 16),
    price: Number(price),
  };
}

/** The approval queue: oldest submissions first, so nobody waits forever. */
export async function listEventsByStatus({ page, pageSize, status }) {
  const where = { status };

  const [events, total] = await prisma.$transaction([
    prisma.event.findMany({
      where,
      orderBy: [{ updated_at: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: EVENT_INCLUDE,
    }),
    prisma.event.count({ where }),
  ]);

  return { events: events.map(serialize), total };
}

/** Loads a pending event or explains why it cannot be reviewed. */
async function loadPendingEvent(eventId) {
  const event = await prisma.event.findUnique({ where: { event_id: eventId } });
  if (!event) throw ApiError.notFound('Event not found', 'EVENT_NOT_FOUND');

  if (event.status !== 'pending') {
    throw ApiError.conflict(
      `Only pending events can be reviewed (this one is ${event.status})`,
      'NOT_PENDING',
    );
  }
  return event;
}

/**
 * Moves a pending event to a new status. The status check inside `where`
 * stops two admins reviewing the same event at the same moment.
 */
async function review(eventId, data) {
  const { count } = await prisma.event.updateMany({
    where: { event_id: eventId, status: 'pending' },
    data,
  });
  if (count === 0) {
    throw ApiError.conflict('Another admin just reviewed this event', 'ALREADY_REVIEWED');
  }
  const reviewed = await prisma.event.findUnique({
    where: { event_id: eventId },
    include: EVENT_INCLUDE,
  });
  return serialize(reviewed);
}

/** Approves a pending event so students can see and book it. */
export async function approveEvent(eventId) {
  const event = await loadPendingEvent(eventId);
  if (hasEventStarted(event)) {
    throw ApiError.conflict('This event has already started', 'EVENT_STARTED');
  }
  return review(eventId, { status: 'approved', rejection_reason: null });
}

/** Rejects a pending event with a reason the organizer can read. */
export async function rejectEvent(eventId, reason) {
  await loadPendingEvent(eventId);
  return review(eventId, { status: 'rejected', rejection_reason: reason });
}