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

export { prisma };
