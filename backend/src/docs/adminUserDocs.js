/**
 * Swagger additions for admin user management: create a user, edit details,
 * change role. Merged into the main spec by withAdminUserDocs().
 */

const bearer = [{ bearerAuth: [] }];
const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const errorRef = (code) => ({ $ref: `#/components/responses/Error${code}` });

const idParam = {
  name: 'id',
  in: 'path',
  required: true,
  schema: { type: 'integer', minimum: 1 },
};

const jsonBody = (schemaName) => ({
  required: true,
  content: { 'application/json': { schema: ref(schemaName) } },
});

const success = (description, dataProperties = {}) => ({
  description,
  content: {
    'application/json': {
      schema: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          data: { type: 'object', properties: dataProperties },
        },
      },
    },
  },
});

const standardErrors = { 401: errorRef(401), 403: errorRef(403) };

const newPaths = {
  '/admin/users': {
    post: {
      tags: ['Admin: users'],
      summary: 'Create an account (admin)',
      description:
        'Creates a student, organizer or admin with a random temporary password, shown once. ' +
        'Only a super admin can create admins. The required fields depend on the role.',
      security: bearer,
      requestBody: jsonBody('CreateUserInput'),
      responses: {
        201: success('Account created', {
          user: ref('User'),
          temporaryPassword: { type: 'string', example: 'aXMypa5LuseQ' },
          message: { type: 'string' },
        }),
        400: errorRef(400),
        409: errorRef(409),
        ...standardErrors,
      },
    },
  },
  '/admin/users/{id}': {
    patch: {
      tags: ['Admin: users'],
      summary: 'Edit a user’s details',
      description:
        'Send only the fields that change. Students can change student_id_number and ' +
        'programme; organizers can change org_name and verified. Fields that do not suit the ' +
        'user’s role are refused (FIELD_NOT_FOR_ROLE). You cannot edit your own account here.',
      security: bearer,
      parameters: [idParam],
      requestBody: jsonBody('UpdateUserInput'),
      responses: {
        200: success('Updated', { user: ref('User') }),
        400: errorRef(400),
        404: errorRef(404),
        409: errorRef(409),
        ...standardErrors,
      },
    },
  },
  '/admin/users/{id}/role': {
    patch: {
      tags: ['Admin: users'],
      summary: 'Change a user’s role',
      description:
        'Only possible while the user has no bookings or events (ROLE_HAS_HISTORY otherwise). ' +
        'The user is logged out so the new role applies at once. Only a super admin can make ' +
        'someone an admin.',
      security: bearer,
      parameters: [idParam],
      requestBody: jsonBody('ChangeRoleInput'),
      responses: {
        200: success('Role changed', { user: ref('User'), message: { type: 'string' } }),
        400: errorRef(400),
        404: errorRef(404),
        409: errorRef(409),
        ...standardErrors,
      },
    },
  },
};

const newSchemas = {
  CreateUserInput: {
    type: 'object',
    required: ['name', 'email', 'role'],
    properties: {
      name: { type: 'string', example: 'Test Student' },
      email: { type: 'string', example: 'newstudent@cems.test' },
      role: { type: 'string', enum: ['student', 'organizer', 'admin'] },
      student_id_number: { type: 'string', example: '200099', description: 'Required for students' },
      programme: { type: 'string', description: 'Students only (optional)' },
      org_name: { type: 'string', example: 'Drama Club', description: 'Required for organizers' },
      verified: { type: 'boolean', default: true, description: 'Organizers only' },
      access_level: { type: 'integer', enum: [1, 2], default: 1, description: 'Admins only: 1 = admin, 2 = super admin' },
    },
  },
  UpdateUserInput: {
    type: 'object',
    description: 'Any of these fields; at least one is required.',
    properties: {
      name: { type: 'string' },
      email: { type: 'string' },
      student_id_number: { type: 'string', description: 'Students only' },
      programme: { type: 'string', nullable: true, description: 'Students only' },
      org_name: { type: 'string', description: 'Organizers only' },
      verified: { type: 'boolean', description: 'Organizers only' },
    },
  },
  ChangeRoleInput: {
    type: 'object',
    required: ['role'],
    properties: {
      role: { type: 'string', enum: ['student', 'organizer', 'admin'] },
      student_id_number: { type: 'string', description: 'Required when the new role is student' },
      programme: { type: 'string', description: 'Students only (optional)' },
      org_name: { type: 'string', description: 'Required when the new role is organizer' },
      access_level: { type: 'integer', enum: [1, 2], default: 1, description: 'Admins only' },
    },
  },
};

/** Returns a copy of the spec with the user-management additions merged in. */
export function withAdminUserDocs(spec) {
  const paths = { ...spec.paths };
  for (const [path, operations] of Object.entries(newPaths)) {
    paths[path] = { ...paths[path], ...operations }; // keeps the existing GET on the same path
  }
  return {
    ...spec,
    paths,
    components: {
      ...spec.components,
      schemas: { ...spec.components.schemas, ...newSchemas },
    },
  };
}