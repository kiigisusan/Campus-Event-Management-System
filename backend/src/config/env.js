/**
 * Loads and validates environment variables once at startup.
 *
 * Every other module imports `env` from here instead of reading process.env
 * directly, so a missing or malformed setting fails fast with a clear message
 * rather than causing a confusing error deep inside a request.
 */
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ quiet: true });

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),

    // Runtime connection string. Uses the least-privilege app user (no DDL rights).
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

    // Origin of the React app, used for CORS and for links in emails.
    CLIENT_URL: z.url().default('http://localhost:5173'),

    APP_NAME: z.string().default('Campus Event Management System'),

    // --- Auth ---------------------------------------------------------------
    // Signs every JWT. Long and random: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    // Logged-in users are signed out after this many minutes without any request (NFR2).
    SESSION_TIMEOUT_MINUTES: z.coerce.number().int().min(1).default(30),
    // bcrypt cost factor. 12 is a good production value; tests use a low value for speed.
    BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
    PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().min(5).default(30),
    // Roles that must enter an emailed code after their password. Comma-separated.
    TWOFA_ROLES: z
      .string()
      .default('admin')
      .transform((value) =>
        value
          .split(',')
          .map((role) => role.trim())
          .filter(Boolean),
      )
      .pipe(z.array(z.enum(['student', 'organizer', 'admin']))),
    TWOFA_CODE_TTL_MINUTES: z.coerce.number().int().min(1).default(10),

    // --- Email (Nodemailer) ---------------------------------------------------
    // Leave SMTP_HOST empty in development: emails are then printed to the console instead.
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    SMTP_SECURE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    EMAIL_FROM: z.string().default('CEMS <no-reply@cems.local>'),

    // --- Bookings -------------------------------------------------------------
    // How long a seat is held for an unpaid booking before it is released.
    BOOKING_HOLD_MINUTES: z.coerce.number().int().min(2).default(10),

    // --- M-Pesa (Daraja) ------------------------------------------------------
    // mock: no network calls; payments are simulated (default, for development and demos)
    // sandbox / production: real Daraja API
    MPESA_MODE: z.enum(['mock', 'sandbox', 'production']).default('mock'),
    MPESA_CONSUMER_KEY: z.string().optional(),
    MPESA_CONSUMER_SECRET: z.string().optional(),
    MPESA_SHORTCODE: z.string().default('174379'), // Safaricom's public sandbox paybill
    MPESA_PASSKEY: z.string().optional(),
    // Public HTTPS base URL Safaricom calls back, e.g. an ngrok URL in development.
    MPESA_CALLBACK_BASE_URL: z.url().optional(),
    // Secret path segment in the callback URL. Daraja does not sign callbacks, so this
    // is what stops anyone else from posting fake "payment succeeded" messages.
    MPESA_CALLBACK_TOKEN: z.string().min(16).optional(),
    // Mock mode: simulate Safaricom's callback automatically after this delay.
    MPESA_MOCK_AUTO_CALLBACK: z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),
    MPESA_MOCK_DELAY_MS: z.coerce.number().int().min(0).default(4000),
  })
  .superRefine((config, ctx) => {
    // Real Daraja modes cannot work without credentials and a reachable callback URL.
    if (config.MPESA_MODE === 'mock') return;
    for (const key of [
      'MPESA_CONSUMER_KEY',
      'MPESA_CONSUMER_SECRET',
      'MPESA_PASSKEY',
      'MPESA_CALLBACK_BASE_URL',
      'MPESA_CALLBACK_TOKEN',
    ]) {
      if (!config[key]) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: `required when MPESA_MODE=${config.MPESA_MODE}`,
        });
      }
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

/** Validated, typed configuration. Frozen so nothing can change it at runtime. */
export const env = Object.freeze({
  ...parsed.data,
  isProduction: parsed.data.NODE_ENV === 'production',
  isTest: parsed.data.NODE_ENV === 'test',
});
