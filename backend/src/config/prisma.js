/**
 * Single shared Prisma client for the whole app.
 *
 * Creating a new PrismaClient per request would open a new connection pool
 * each time and quickly exhaust MySQL connections, so every service imports
 * this one instance instead.
 *
 * Prisma always sends parameterized queries (prepared statements), which is
 * what protects us from SQL injection. For raw SQL, only ever use the tagged
 * template form `prisma.$queryRaw\`... ${value}\`` - never $queryRawUnsafe
 * with string concatenation.
 */
import { PrismaClient } from '@prisma/client';
import { env } from './env.js';

export const prisma = new PrismaClient({
  log: env.isProduction ? ['error'] : ['warn', 'error'],
});
