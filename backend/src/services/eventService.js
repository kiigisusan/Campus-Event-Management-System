/**
 * Business logic for events: browsing, creating, editing, submitting for
 * approval and cancelling.
 *
 * Status flow: draft -> pending (submit) -> approved / rejected (admin).
 * Editing a rejected event moves it back to draft so it can be resubmitted.
 */
import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/ApiError.js';
import { EAT_OFFSET_MINUTES, hasEventStarted } from '../utils/eventTime.js';
import { notifyEventCancelled } from './notificationService.js';

const EVENT_INCLUDE = {
  venue: { select: { venue_id: true, name: true, location: true } },
  category: { select: { category_id: true, name: true } },
  organizer: { select: { user_id: true, name: true, org_name: true, verified: true } },
};

const toDbDate = (isoDate) => new Date(`${isoDate}T00:00:00.000Z`);
const toDbTime = (hhmm) => new Date(`1970-01-01T${hhmm}:00.000Z`);
const todayInKenya = () =>
  new Date(Date.now() + EAT_OFFSET_MINUTES * 60_000).toISOString().slice(0, 10);

/** Turns a database row into the JSON the frontend receives. */
function serialize(event, { includePrivate = false } = {}) {
  const { event_date: date, event_time: time, price, rejection_reason: reason, ...rest } = event;
  return {
    ...rest,
    event_date: date.toISOString().slice(0, 10),
    event_time: time.toISOString().slice(11, 16),
    price: Number(price),
    ...(includePrivate ? { rejection_reason: reason } : {}),
  };
}

function assertStartsInFuture(dateValue, timeValue) {
  if (hasEventStarted({ event_date: dateValue, event_time: timeValue })) {
    throw ApiError.badRequest('The event must start in the future', undefined, 'EVENT_IN_PAST');
  }
}

async function loadVenue(db, venueId) {
  const venue = await db.venue.findUnique({ where: { venue_id: venueId } });
  if (!venue) throw ApiError.badRequest('Venue not found', undefined, 'VENUE_NOT_FOUND');
  return venue;
}

async function assertCategoryExists(db, categoryId) {
  const category = await db.category.findUnique({ where: { category_id: categoryId } });
  if (!category) throw ApiError.badRequest('Category not found', undefined, 'CATEGORY_NOT_FOUND');
}

function assertFitsVenue(capacity, venue) {
  if (capacity > venue.capacity) {
    throw ApiError.badRequest(
      `Capacity cannot be more than the venue capacity (${venue.capacity})`,
      undefined,
      'CAPACITY_EXCEEDS_VENUE',
    );
  }
}

/** Loads an event for its owner; other people's events look like they do not exist. */
function assertOwner(event, userId) {
  if (!event || event.organizer_id !== userId) {
    throw ApiError.notFound('Event not found', 'EVENT_NOT_FOUND');
  }
}

// --- Browsing -------------------------------------------------------------

/** Public list: approved, upcoming events with search and filters. */
export async function listPublicEvents(query) {
  const { page, pageSize, search, category_id, venue_id, from, to, free, sort, order } = query;

  const where = {
    status: 'approved',
    event_date: {
      gte: toDbDate(from ?? todayInKenya()),
      ...(to ? { lte: toDbDate(to) } : {}),
    },
    ...(category_id ? { category_id } : {}),
    ...(venue_id ? { venue_id } : {}),
    ...(free === 'true' ? { price: 0 } : {}),
    ...(free === 'false' ? { price: { gt: 0 } } : {}),
    ...(search
      ? { OR: [{ title: { contains: search } }, { description: { contains: search } }] }
      : {}),
  };

  const orderBy = {
    date: [{ event_date: order }, { event_time: order }],
    price: [{ price: order }, { event_date: 'asc' }],
    title: [{ title: order }],
  }[sort];

  const [events, total] = await prisma.$transaction([
    prisma.event.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: EVENT_INCLUDE,
    }),
    prisma.event.count({ where }),
  ]);

  return { events: events.map((event) => serialize(event)), total };
}

/** One event. Non-approved events are visible only to their owner and to admins. */
export async function getEventById(eventId, user) {
  const event = await prisma.event.findUnique({
    where: { event_id: eventId },
    include: EVENT_INCLUDE,
  });
  const canSeePrivate = user && (user.role === 'admin' || user.user_id === event?.organizer_id);

  if (!event || (event.status !== 'approved' && !canSeePrivate)) {
    throw ApiError.notFound('Event not found', 'EVENT_NOT_FOUND');
  }
  return serialize(event, { includePrivate: Boolean(canSeePrivate) });
}

/** The organizer's own events, any status. */
export async function listOrganizerEvents(organizerId, { page, pageSize, status }) {
  const where = { organizer_id: organizerId, ...(status ? { status } : {}) };

  const [events, total] = await prisma.$transaction([
    prisma.event.findMany({
      where,
      orderBy: [{ event_date: 'desc' }, { event_time: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: EVENT_INCLUDE,
    }),
    prisma.event.count({ where }),
  ]);

  return { events: events.map((event) => serialize(event, { includePrivate: true })), total };
}

// --- Organizer actions ----------------------------------------------------

/** Creates an event as a draft. */
export async function createEvent(organizerId, data) {
  assertStartsInFuture(toDbDate(data.event_date), toDbTime(data.event_time));
  const venue = await loadVenue(prisma, data.venue_id);
  await assertCategoryExists(prisma, data.category_id);
  assertFitsVenue(data.capacity, venue);

  const event = await prisma.event.create({
    data: {
      title: data.title,
      description: data.description,
      event_date: toDbDate(data.event_date),
      event_time: toDbTime(data.event_time),
      venue_id: data.venue_id,
      capacity: data.capacity,
      spots_remaining: data.capacity,
      price: data.price,
      category_id: data.category_id,
      organizer_id: organizerId,
      image_url: data.image_url ?? null,
      status: 'draft',
    },
    include: EVENT_INCLUDE,
  });
  return serialize(event, { includePrivate: true });
}

/**
 * Edits an event the organizer owns. The event row is locked first so a
 * capacity change cannot race with a booking.
 */
export async function updateEvent({ eventId, organizerId, data }) {
  const updated = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT event_id FROM events WHERE event_id = ${eventId} FOR UPDATE`;
    const event = await tx.event.findUnique({ where: { event_id: eventId } });
    assertOwner(event, organizerId);

    if (event.status === 'cancelled') {
      throw ApiError.conflict('A cancelled event cannot be edited', 'EVENT_CANCELLED');
    }
    if (hasEventStarted(event)) {
      throw ApiError.conflict('This event has already started', 'EVENT_STARTED');
    }

    const booked = event.capacity - event.spots_remaining; // seats taken or held
    const changesCoreDetails =
      data.event_date !== undefined ||
      data.event_time !== undefined ||
      data.venue_id !== undefined ||
      (data.price !== undefined && Number(data.price) !== Number(event.price));
    if (booked > 0 && changesCoreDetails) {
      throw ApiError.conflict(
        'Date, time, venue and price cannot change once students have booked',
        'EVENT_HAS_BOOKINGS',
      );
    }

    const patch = {};
    for (const key of ['title', 'description', 'price', 'category_id', 'venue_id']) {
      if (data[key] !== undefined) patch[key] = data[key];
    }
    if (data.image_url !== undefined) patch.image_url = data.image_url;
    if (data.event_date !== undefined) patch.event_date = toDbDate(data.event_date);
    if (data.event_time !== undefined) patch.event_time = toDbTime(data.event_time);

    assertStartsInFuture(patch.event_date ?? event.event_date, patch.event_time ?? event.event_time);
    if (data.category_id !== undefined) await assertCategoryExists(tx, data.category_id);

    const venue = await loadVenue(tx, patch.venue_id ?? event.venue_id);
    const newCapacity = data.capacity ?? event.capacity;
    assertFitsVenue(newCapacity, venue);
    if (data.capacity !== undefined) {
      if (data.capacity < booked) {
        throw ApiError.conflict(
          `${booked} seats are already booked or held, so capacity cannot be below that`,
          'CAPACITY_BELOW_BOOKINGS',
        );
      }
      patch.capacity = data.capacity;
      patch.spots_remaining = data.capacity - booked;
    }

    // A rejected event goes back to draft so the organizer can fix it and resubmit.
    if (event.status === 'rejected') {
      patch.status = 'draft';
      patch.rejection_reason = null;
    }

    return tx.event.update({
      where: { event_id: eventId },
      data: patch,
      include: EVENT_INCLUDE,
    });
  });
  return serialize(updated, { includePrivate: true });
}

/** Sends a draft to the admins for approval. */
export async function submitEvent({ eventId, organizerId }) {
  const event = await prisma.event.findUnique({ where: { event_id: eventId } });
  assertOwner(event, organizerId);

  if (event.status !== 'draft') {
    throw ApiError.conflict('Only draft events can be submitted for approval', 'NOT_A_DRAFT');
  }
  assertStartsInFuture(event.event_date, event.event_time);

  const submitted = await prisma.event.update({
    where: { event_id: eventId },
    data: { status: 'pending' },
    include: EVENT_INCLUDE,
  });
  return serialize(submitted, { includePrivate: true });
}

/**
 * Cancels an event (its organizer or any admin) and emails the students who
 * had booked.
 * @returns {Promise<{ event: object, notified: number }>}
 */
export async function cancelEvent({ eventId, user, reason }) {
  const event = await prisma.event.findUnique({ where: { event_id: eventId } });
  if (user.role !== 'admin') assertOwner(event, user.user_id);
  if (!event) throw ApiError.notFound('Event not found', 'EVENT_NOT_FOUND');

  if (!['draft', 'pending', 'approved'].includes(event.status)) {
    throw ApiError.conflict(`A ${event.status} event cannot be cancelled`, 'CANNOT_CANCEL');
  }
  if (hasEventStarted(event)) {
    throw ApiError.conflict('This event has already started', 'EVENT_STARTED');
  }

  // The status check in `where` stops two people cancelling at the same moment.
  const { count } = await prisma.event.updateMany({
    where: { event_id: eventId, status: event.status },
    data: { status: 'cancelled' },
  });
  if (count === 0) {
    throw ApiError.conflict('The event was just changed. Please refresh.', 'EVENT_CHANGED');
  }

  const notified = await notifyEventCancelled(eventId, { reason });
  const cancelled = await prisma.event.findUnique({
    where: { event_id: eventId },
    include: EVENT_INCLUDE,
  });
  return { event: serialize(cancelled, { includePrivate: true }), notified };
}