/**
 * Entry point: starts the HTTP server and shuts it down cleanly.
 */
import { createApp } from './app.js';
import { env } from './config/env.js';
import { prisma } from './config/prisma.js';
import { startBookingExpiryJob } from './jobs/expirePendingBookings.js';

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`CEMS API listening on http://localhost:${env.PORT}/api/v1 (${env.NODE_ENV})`);
  console.log(`M-Pesa mode: ${env.MPESA_MODE}`);
});

// Background job: release seats held by bookings that were never paid.
const stopExpiryJob = startBookingExpiryJob();

/**
 * Stop accepting new connections, let in-flight requests finish, close the
 * database pool, then exit.
 * Docker sends SIGTERM on `docker compose down`; Ctrl+C sends SIGINT.
 * @param {string} signal
 */
function shutdown(signal) {
  console.log(`${signal} received, shutting down...`);
  stopExpiryJob();
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  // Force exit if something keeps the server open for too long.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// A promise rejection nobody handled means the app is in an unknown state:
// log it and exit so Docker restarts a clean process.
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
  shutdown('unhandledRejection');
});
