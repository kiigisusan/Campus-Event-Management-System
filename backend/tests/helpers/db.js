/**
 * Test helpers for database-backed tests.
 */
import bcrypt from 'bcryptjs';
import { prisma } from '../../src/config/prisma.js';

/** True when a test database is configured; database suites are skipped otherwise. */
export const hasTestDatabase = Boolean(process.env.TEST_DATABASE_URL);

/** `describe` that is skipped automatically when there is no test database. */
export const describeDb = hasTestDatabase ? describe : describe.skip;

export const TEST_PASSWORD = 'Password123!';

/** Deletes all rows, children before parents so foreign keys are respected. */
export async function resetDatabase() {
  await prisma.auditLog.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.event.deleteMany();
  await prisma.venue.deleteMany();
  await prisma.category.deleteMany();
  await prisma.user.deleteMany();
}

let userCounter = 0;

/**
 * Creates a user directly in the database (password: TEST_PASSWORD).
 * @param {Partial<import('@prisma/client').User>} overrides
 */
export async function createUser(overrides = {}) {
  userCounter += 1;
  const role = overrides.role ?? 'student';
  return prisma.user.create({
    data: {
      name: `Test User ${userCounter}`,
      email: `user${userCounter}-${Date.now()}@test.local`,
      password_hash: await bcrypt.hash(TEST_PASSWORD, 4),
      role,
      access_level: role === 'admin' ? 1 : null,
      ...overrides,
    },
  });
}

/** A DATE `days` from today (UTC midnight), as stored in events.event_date. */
export function daysFromToday(days) {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

let eventCounter = 0;

/**
 * Creates an approved, free, future event (with its own category, venue and
 * organizer unless given). Override anything, e.g. { price: 500, capacity: 1 }.
 * @param {Partial<import('@prisma/client').Event>} overrides
 */
export async function createEvent(overrides = {}) {
  eventCounter += 1;
  const tag = `${eventCounter}-${Date.now()}`;
  const capacity = overrides.capacity ?? 50;

  const category_id =
    overrides.category_id ??
    (await prisma.category.create({ data: { name: `Category ${tag}` } })).category_id;
  const venue_id =
    overrides.venue_id ??
    (
      await prisma.venue.create({
        data: { name: `Venue ${tag}`, location: 'Campus', capacity: 500 },
      })
    ).venue_id;
  const organizer_id =
    overrides.organizer_id ?? (await createUser({ role: 'organizer', org_name: 'Club' })).user_id;

  return prisma.event.create({
    data: {
      title: `Event ${tag}`,
      description: 'Test event',
      event_date: daysFromToday(7),
      event_time: new Date('1970-01-01T14:00:00.000Z'),
      price: 0,
      status: 'approved',
      ...overrides,
      capacity,
      spots_remaining: overrides.spots_remaining ?? capacity,
      category_id,
      venue_id,
      organizer_id,
    },
  });
}

export { prisma };
