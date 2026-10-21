/**
 * Zod schemas for the /auth routes. Error messages are written for end users
 * because the frontend shows them next to the form fields.
 */
import { z } from 'zod';

/** Trimmed, lower-cased email so "Kevin@Mail.com " and "kevin@mail.com" are the same account. */
export const emailField = z
  .string({ error: 'Email is required' })
  .trim()
  .toLowerCase()
  .max(150, 'Email must be at most 150 characters')
  .pipe(z.email({ error: 'Enter a valid email address' }));

/**
 * New-password rule. bcrypt only uses the first 72 bytes, hence the maximum.
 */
export const newPasswordField = z
  .string({ error: 'Password is required' })
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters')
  .regex(/[A-Za-z]/, 'Password must contain at least one letter')
  .regex(/\d/, 'Password must contain at least one number');

const nameField = z
  .string({ error: 'Name is required' })
  .trim()
  .min(2, 'Name must be at least 2 characters')
  .max(100, 'Name must be at most 100 characters');

const baseRegisterFields = {
  name: nameField,
  email: emailField,
  password: newPasswordField,
};

/**
 * Self-registration is open to students and organizers only. Admin accounts
 * are created by a super admin, never through this endpoint.
 */
export const registerSchema = z.discriminatedUnion(
  'role',
  [
    z.object({
      ...baseRegisterFields,
      role: z.literal('student'),
      student_id_number: z
        .string({ error: 'Student ID is required' })
        .trim()
        .regex(/^[A-Za-z0-9-]{3,20}$/, 'Student ID must be 3-20 letters, digits or dashes'),
      programme: z.string().trim().max(100).optional(),
    }),
    z.object({
      ...baseRegisterFields,
      role: z.literal('organizer'),
      org_name: z
        .string({ error: 'Organisation name is required' })
        .trim()
        .min(2, 'Organisation name must be at least 2 characters')
        .max(150),
    }),
  ],
  { error: 'Role must be either student or organizer' },
);

export const loginSchema = z.object({
  email: emailField,
  // Only presence is checked at login: old passwords may predate the current rule.
  password: z.string({ error: 'Password is required' }).min(1, 'Password is required').max(200),
});

export const forgotPasswordSchema = z.object({
  email: emailField,
});

export const resetPasswordSchema = z.object({
  token: z
    .string({ error: 'Reset token is required' })
    .trim()
    .min(20, 'This reset link is invalid')
    .max(200, 'This reset link is invalid'),
  password: newPasswordField,
});

export const verifyTwoFactorSchema = z.object({
  twoFactorToken: z.string({ error: 'Login attempt is missing. Please log in again.' }).min(20),
  code: z
    .string({ error: 'Code is required' })
    .trim()
    .regex(/^\d{6}$/, 'Enter the 6-digit code from the email'),
});
