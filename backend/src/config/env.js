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

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),

  // Runtime connection string. Uses the least-privilege app user (no DDL rights).
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // Origin of the React app, used for CORS and for links in emails.
  CLIENT_URL: z.url().default('http://localhost:5173'),

  APP_NAME: z.string().default('Campus Event Management System'),
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
