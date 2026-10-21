/**
 * Runs once before the whole test run: brings the test database schema up to
 * date by applying any pending Prisma migrations (creating the database if it
 * does not exist yet). Each test file then clears the rows it needs with
 * resetDatabase() from tests/helpers/db.js.
 *
 * Needs TEST_DATABASE_URL (in backend/.env or the shell), pointing at a
 * database whose name ends in "_test" using an account that may create
 * databases (e.g. root on the Docker MySQL). Without it, database tests are
 * skipped and only the pure HTTP/unit tests run.
 */
import { execSync } from 'node:child_process';

export default function globalSetup() {
  try {
    process.loadEnvFile('.env');
  } catch {
    // no .env file
  }

  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    console.warn('\nTEST_DATABASE_URL is not set: database tests will be skipped.\n');
    return;
  }

  // Safety net: tests delete every row, so never point them at real data.
  const dbName = new URL(url).pathname.slice(1);
  if (!dbName.endsWith('_test')) {
    throw new Error(`Refusing to use "${dbName}": the test database name must end in "_test".`);
  }

  execSync('npx prisma migrate deploy', {
    stdio: 'ignore',
    env: { ...process.env, DATABASE_URL: url, MIGRATION_DATABASE_URL: url },
  });
}
