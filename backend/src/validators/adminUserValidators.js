/**
 * Zod schemas for /admin/users.
 */
import { z } from 'zod';
import { emailField } from './authValidators.js';
import { paginationSchema } from './common.js';

const nameField = z.string().trim().min(2, 'Name must be at least 2 characters').max(100);

const studentIdField = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9-]{3,20}$/, 'Student ID must be 3-20 letters, digits or dashes');

const orgNameField = z.string().trim().min(2).max(150);

const accessLevelField = z.union([z.literal(1), z.literal(2)]);

/** GET /admin/users (search by name, email, student ID or organisation). */
export const listUsersSchema = paginationSchema.extend({
  search: z.string().trim().max(100).optional(),
  role: z.enum(['student', 'organizer', 'admin']).optional(),
  is_active: z.enum(['true', 'false']).optional(),
});

/** POST /admin/users: which extra fields are needed depends on the role. */
export const createUserSchema = z.discriminatedUnion(
  'role',
  [
    z.object({
      role: z.literal('student'),
      name: nameField,
      email: emailField,
      student_id_number: studentIdField,
      programme: z.string().trim().max(100).optional(),
    }),
    z.object({
      role: z.literal('organizer'),
      name: nameField,
      email: emailField,
      org_name: orgNameField,
      verified: z.boolean().default(true),
    }),
    z.object({
      role: z.literal('admin'),
      name: nameField,
      email: emailField,
      access_level: accessLevelField.default(1), // 1 = admin, 2 = super admin
    }),
  ],
  { error: 'Role must be student, organizer or admin' },
);

/** PATCH /admin/users/:id (send only what changes; fields must suit the user's role). */
export const updateUserSchema = z
  .object({
    name: nameField,
    email: emailField,
    student_id_number: studentIdField,
    programme: z.string().trim().max(100).nullable(),
    org_name: orgNameField,
    verified: z.boolean(),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Send at least one field to update',
  });

/** PATCH /admin/users/:id/role */
export const changeRoleSchema = z.discriminatedUnion(
  'role',
  [
    z.object({
      role: z.literal('student'),
      student_id_number: studentIdField,
      programme: z.string().trim().max(100).optional(),
    }),
    z.object({ role: z.literal('organizer'), org_name: orgNameField }),
    z.object({ role: z.literal('admin'), access_level: accessLevelField.default(1) }),
  ],
  { error: 'Role must be student, organizer or admin' },
);