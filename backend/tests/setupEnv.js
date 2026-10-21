// Runs before every test file (see "setupFiles" in package.json).
// Gives tests a predictable environment without needing a real .env file.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'mysql://cems_app:test@localhost:3306/cems_test';
