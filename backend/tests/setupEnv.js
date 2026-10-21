// Runs before every test file (see "setupFiles" in package.json).
// Gives tests a predictable environment and points DATABASE_URL at the
// separate test database, so tests never touch development data.

// Read backend/.env (for TEST_DATABASE_URL) if it exists. Missing file is fine (CI).
try {
  process.loadEnvFile('.env');
} catch {
  // no .env file
}

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ||= 'test-secret-that-is-at-least-32-characters-long';
process.env.BCRYPT_ROUNDS = '4'; // fast hashing in tests
process.env.SMTP_HOST = ''; // never send real email from tests
process.env.EMAIL_NOTIFICATIONS = 'false'; // notification.test.js turns them on for itself
process.env.MPESA_MODE = 'mock'; // never call Safaricom from tests
process.env.MPESA_MOCK_AUTO_CALLBACK = 'false'; // tests post callbacks themselves
process.env.MPESA_CALLBACK_TOKEN = 'test-callback-token-1234567890';

if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
} else {
  // Placeholder so config validation passes; DB tests are skipped without TEST_DATABASE_URL.
  process.env.DATABASE_URL = 'mysql://cems_app:test@localhost:3306/cems_test';
}
