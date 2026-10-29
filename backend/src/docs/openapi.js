/**
 * OpenAPI 3 description of the CEMS API, shown by Swagger UI at /api/docs.
 *
 * Covers the events, approval, categories, venues and user-management
 * endpoints, plus login (so the docs page can be authorised with a token).
 * The raw JSON is served at /api/docs.json.
 */

const bearer = [{ bearerAuth: [] }];

const ref = (name) => ({ $ref: `#/components/schemas/${name}` });

const idParam = {
  name: 'id',
  in: 'path',
  required: true,
  schema: { type: 'integer', minimum: 1 },
};

const pagingParams = [
  { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
  { name: 'pageSize', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
];

const jsonBody = (schemaName, required = true) => ({
  required,
  content: { 'application/json': { schema: ref(schemaName) } },
});

/** A successful response in the standard { success, data, meta } shape. */
const success = (description, dataProperties = {}, paginated = false) => ({
  description,
  content: {
    'application/json': {
      schema: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          data: { type: 'object', properties: dataProperties },
          ...(paginated ? { meta: ref('PaginationMeta') } : {}),
        },
      },
    },
  },
});

const errorRef = (code) => ({ $ref: `#/components/responses/Error${code}` });

const standardErrors = { 401: errorRef(401), 403: errorRef(403) };

export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'CEMS API',
    version: '1.0.0',
    description:
      'Campus Event Management System REST API.\n\n' +
      '**How to try it:** log in with `POST /auth/login` (admins also finish with ' +
      '`POST /auth/2fa/verify`), copy the `token`, click **Authorize** and paste it.\n\n' +
      'Demo accounts (password `Password123!`): `organizer@cems.test`, `student@cems.test`, ' +
      '`admin@cems.test`.',
  },
  servers: [{ url: '/api/v1', description: 'This server' }],
  tags: [
    { name: 'Auth', description: 'Login (needed to get a token)' },
    { name: 'Events', description: 'Browse, create, edit, submit and cancel events' },
    { name: 'Admin: event approval', description: 'The approval queue (admins only)' },
    { name: 'Categories', description: 'Event categories' },
    { name: 'Venues', description: 'Event venues' },
    { name: 'Admin: users', description: 'User management (admins only)' },
  ],
  paths: {
    // --- Auth --------------------------------------------------------------
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Log in',
        description:
          'Students and organizers get a token straight away. Admins get ' +
          '`twoFactorRequired: true` and must call `/auth/2fa/verify` with the emailed code.',
        requestBody: jsonBody('LoginInput'),
        responses: {
          200: success('Logged in, or a second step is required', {
            twoFactorRequired: { type: 'boolean' },
            token: { type: 'string' },
            twoFactorToken: { type: 'string' },
            user: ref('User'),
          }),
          400: errorRef(400),
          401: errorRef(401),
          429: errorRef(429),
        },
      },
    },
    '/auth/2fa/verify': {
      post: {
        tags: ['Auth'],
        summary: 'Finish an admin login with the emailed code',
        requestBody: jsonBody('TwoFactorInput'),
        responses: {
          200: success('Logged in', { token: { type: 'string' }, user: ref('User') }),
          400: errorRef(400),
          401: errorRef(401),
        },
      },
    },

    // --- Events ------------------------------------------------------------
    '/events': {
      get: {
        tags: ['Events'],
        summary: 'List approved, upcoming events (public)',
        parameters: [
          ...pagingParams,
          { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Matches title or description' },
          { name: 'category_id', in: 'query', schema: { type: 'integer' } },
          { name: 'venue_id', in: 'query', schema: { type: 'integer' } },
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date' }, description: 'Default: today' },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'free', in: 'query', schema: { type: 'string', enum: ['true', 'false'] } },
          { name: 'sort', in: 'query', schema: { type: 'string', enum: ['date', 'price', 'title'], default: 'date' } },
          { name: 'order', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'], default: 'asc' } },
        ],
        responses: {
          200: success('Page of events', { events: { type: 'array', items: ref('Event') } }, true),
          400: errorRef(400),
        },
      },
      post: {
        tags: ['Events'],
        summary: 'Create an event as a draft (organizer)',
        security: bearer,
        requestBody: jsonBody('EventInput'),
        responses: {
          201: success('Draft created', { event: ref('Event') }),
          400: errorRef(400),
          ...standardErrors,
        },
      },
    },
    '/events/mine': {
      get: {
        tags: ['Events'],
        summary: "List the logged-in organizer's own events, any status",
        security: bearer,
        parameters: [
          ...pagingParams,
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['draft', 'pending', 'approved', 'rejected', 'cancelled'] } },
        ],
        responses: {
          200: success('Page of events', { events: { type: 'array', items: ref('Event') } }, true),
          ...standardErrors,
        },
      },
    },
    '/events/{id}': {
      get: {
        tags: ['Events'],
        summary: 'Get one event',
        description:
          'Anyone can see an approved event. Drafts, pending, rejected and cancelled events are ' +
          'visible only to their organizer and to admins (send the token).',
        parameters: [idParam],
        responses: {
          200: success('The event', { event: ref('Event') }),
          404: errorRef(404),
        },
      },
      patch: {
        tags: ['Events'],
        summary: 'Edit an event (its organizer)',
        description:
          'Send only the fields that change. Once students have booked, date, time, venue and ' +
          'price are locked and capacity cannot go below the booked seats. Editing a rejected ' +
          'event moves it back to draft.',
        security: bearer,
        parameters: [idParam],
        requestBody: jsonBody('EventUpdate'),
        responses: {
          200: success('Updated event', { event: ref('Event') }),
          400: errorRef(400),
          404: errorRef(404),
          409: errorRef(409),
          ...standardErrors,
        },
      },
    },
    '/events/{id}/submit': {
      patch: {
        tags: ['Events'],
        summary: 'Send a draft to the admins for approval (its organizer)',
        security: bearer,
        parameters: [idParam],
        responses: {
          200: success('Event is now pending', { event: ref('Event'), message: { type: 'string' } }),
          404: errorRef(404),
          409: errorRef(409),
          ...standardErrors,
        },
      },
    },
    '/events/{id}/cancel': {
      patch: {
        tags: ['Events'],
        summary: 'Cancel an event (its organizer or an admin)',
        description: 'Booked students are emailed automatically.',
        security: bearer,
        parameters: [idParam],
        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { reason: { type: 'string', maxLength: 500, example: 'Speaker is unwell' } },
              },
            },
          },
        },
        responses: {
          200: success('Cancelled', { event: ref('Event'), message: { type: 'string' } }),
          404: errorRef(404),
          409: errorRef(409),
          ...standardErrors,
        },
      },
    },

    // --- Admin: approval ---------------------------------------------------
    '/admin/events': {
      get: {
        tags: ['Admin: event approval'],
        summary: 'The approval queue (oldest first)',
        security: bearer,
        parameters: [
          ...pagingParams,
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['draft', 'pending', 'approved', 'rejected', 'cancelled'], default: 'pending' } },
        ],
        responses: {
          200: success('Page of events with organizer details', { events: { type: 'array', items: ref('Event') } }, true),
          ...standardErrors,
        },
      },
    },
    '/admin/events/{id}/approve': {
      patch: {
        tags: ['Admin: event approval'],
        summary: 'Approve a pending event so students can book it',
        security: bearer,
        parameters: [idParam],
        responses: {
          200: success('Approved', { event: ref('Event'), message: { type: 'string' } }),
          404: errorRef(404),
          409: errorRef(409),
          ...standardErrors,
        },
      },
    },
    '/admin/events/{id}/reject': {
      patch: {
        tags: ['Admin: event approval'],
        summary: 'Reject a pending event with a reason',
        security: bearer,
        parameters: [idParam],
        requestBody: jsonBody('RejectInput'),
        responses: {
          200: success('Rejected', { event: ref('Event'), message: { type: 'string' } }),
          400: errorRef(400),
          404: errorRef(404),
          409: errorRef(409),
          ...standardErrors,
        },
      },
    },

    // --- Categories --------------------------------------------------------
    '/categories': {
      get: {
        tags: ['Categories'],
        summary: 'List all categories (public)',
        responses: { 200: success('Categories', { categories: { type: 'array', items: ref('Category') } }) },
      },
      post: {
        tags: ['Categories'],
        summary: 'Create a category (admin)',
        security: bearer,
        requestBody: jsonBody('CategoryInput'),
        responses: {
          201: success('Created', { category: ref('Category') }),
          400: errorRef(400),
          409: errorRef(409),
          ...standardErrors,
        },
      },
    },
    '/categories/{id}': {
      patch: {
        tags: ['Categories'],
        summary: 'Edit a category (admin)',
        security: bearer,
        parameters: [idParam],
        requestBody: jsonBody('CategoryInput'),
        responses: {
          200: success('Updated', { category: ref('Category') }),
          400: errorRef(400),
          404: errorRef(404),
          409: errorRef(409),
          ...standardErrors,
        },
      },
      delete: {
        tags: ['Categories'],
        summary: 'Delete a category (admin). Refused while events use it.',
        security: bearer,
        parameters: [idParam],
        responses: {
          200: success('Deleted', { message: { type: 'string' } }),
          404: errorRef(404),
          409: errorRef(409),
          ...standardErrors,
        },
      },
    },

    // --- Venues ------------------------------------------------------------
    '/venues': {
      get: {
        tags: ['Venues'],
        summary: 'List all venues (public)',
        responses: { 200: success('Venues', { venues: { type: 'array', items: ref('Venue') } }) },
      },
      post: {
        tags: ['Venues'],
        summary: 'Create a venue (admin)',
        security: bearer,
        requestBody: jsonBody('VenueInput'),
        responses: {
          201: success('Created', { venue: ref('Venue') }),
          400: errorRef(400),
          ...standardErrors,
        },
      },
    },
    '/venues/{id}': {
      patch: {
        tags: ['Venues'],
        summary: 'Edit a venue (admin). Capacity cannot drop below an event that uses it.',
        security: bearer,
        parameters: [idParam],
        requestBody: jsonBody('VenueInput'),
        responses: {
          200: success('Updated', { venue: ref('Venue') }),
          400: errorRef(400),
          404: errorRef(404),
          409: errorRef(409),
          ...standardErrors,
        },
      },
      delete: {
        tags: ['Venues'],
        summary: 'Delete a venue (admin). Refused while events use it.',
        security: bearer,
        parameters: [idParam],
        responses: {
          200: success('Deleted', { message: { type: 'string' } }),
          404: errorRef(404),
          409: errorRef(409),
          ...standardErrors,
        },
      },
    },

    // --- Admin: users ------------------------------------------------------
    '/admin/users': {
      get: {
        tags: ['Admin: users'],
        summary: 'List and search users',
        security: bearer,
        parameters: [
          ...pagingParams,
          { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Name, email, student ID or organisation' },
          { name: 'role', in: 'query', schema: { type: 'string', enum: ['student', 'organizer', 'admin'] } },
          { name: 'is_active', in: 'query', schema: { type: 'string', enum: ['true', 'false'] } },
        ],
        responses: {
          200: success('Page of users', { users: { type: 'array', items: ref('User') } }, true),
          ...standardErrors,
        },
      },
    },
    '/admin/users/{id}': {
      get: {
        tags: ['Admin: users'],
        summary: 'View one user',
        security: bearer,
        parameters: [idParam],
        responses: {
          200: success('The user', { user: ref('User') }),
          404: errorRef(404),
          ...standardErrors,
        },
      },
    },
    '/admin/users/{id}/deactivate': {
      patch: {
        tags: ['Admin: users'],
        summary: 'Block an account and end its sessions',
        description: 'You cannot deactivate yourself. Only a super admin can manage other admins.',
        security: bearer,
        parameters: [idParam],
        responses: {
          200: success('Deactivated', { user: ref('User'), message: { type: 'string' } }),
          404: errorRef(404),
          409: errorRef(409),
          ...standardErrors,
        },
      },
    },
    '/admin/users/{id}/activate': {
      patch: {
        tags: ['Admin: users'],
        summary: 'Allow a deactivated account to log in again',
        security: bearer,
        parameters: [idParam],
        responses: {
          200: success('Reactivated', { user: ref('User'), message: { type: 'string' } }),
          404: errorRef(404),
          409: errorRef(409),
          ...standardErrors,
        },
      },
    },
    '/admin/users/{id}/reset-password': {
      post: {
        tags: ['Admin: users'],
        summary: 'Set a temporary password (shown once) and end the user’s sessions',
        security: bearer,
        parameters: [idParam],
        responses: {
          200: success('Password reset', {
            user: ref('User'),
            temporaryPassword: { type: 'string', example: 'Ab3kQ9xTz2Lm' },
            message: { type: 'string' },
          }),
          404: errorRef(404),
          ...standardErrors,
        },
      },
    },
  },

  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas: {
      PaginationMeta: {
        type: 'object',
        properties: {
          page: { type: 'integer', example: 1 },
          pageSize: { type: 'integer', example: 20 },
          total: { type: 'integer', example: 57 },
          totalPages: { type: 'integer', example: 3 },
        },
      },
      LoginInput: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', example: 'organizer@cems.test' },
          password: { type: 'string', example: 'Password123!' },
        },
      },
      TwoFactorInput: {
        type: 'object',
        required: ['twoFactorToken', 'code'],
        properties: {
          twoFactorToken: { type: 'string' },
          code: { type: 'string', example: '123456' },
        },
      },
      Event: {
        type: 'object',
        properties: {
          event_id: { type: 'integer' },
          title: { type: 'string' },
          description: { type: 'string' },
          event_date: { type: 'string', format: 'date', example: '2026-12-10' },
          event_time: { type: 'string', example: '14:00' },
          venue_id: { type: 'integer' },
          capacity: { type: 'integer' },
          spots_remaining: { type: 'integer' },
          price: { type: 'number', example: 0 },
          category_id: { type: 'integer' },
          organizer_id: { type: 'integer' },
          status: { type: 'string', enum: ['draft', 'pending', 'approved', 'rejected', 'cancelled'] },
          rejection_reason: { type: 'string', nullable: true, description: 'Only shown to the organizer and admins' },
          image_url: { type: 'string', nullable: true },
          venue: { type: 'object', properties: { venue_id: { type: 'integer' }, name: { type: 'string' }, location: { type: 'string' } } },
          category: { type: 'object', properties: { category_id: { type: 'integer' }, name: { type: 'string' } } },
          organizer: { type: 'object', properties: { user_id: { type: 'integer' }, name: { type: 'string' }, org_name: { type: 'string', nullable: true }, verified: { type: 'boolean' } } },
        },
      },
      EventInput: {
        type: 'object',
        required: ['title', 'description', 'event_date', 'event_time', 'venue_id', 'capacity', 'category_id'],
        properties: {
          title: { type: 'string', minLength: 3, maxLength: 150, example: 'Intro to Docker Workshop' },
          description: { type: 'string', minLength: 10, example: 'Hands-on workshop on containers for beginners.' },
          event_date: { type: 'string', format: 'date', example: '2026-12-10' },
          event_time: { type: 'string', example: '14:00', description: '24-hour HH:MM, Kenyan time' },
          venue_id: { type: 'integer', example: 1 },
          capacity: { type: 'integer', example: 20, description: 'Cannot exceed the venue capacity' },
          price: { type: 'number', example: 0, description: '0 = free' },
          category_id: { type: 'integer', example: 1 },
          image_url: { type: 'string', nullable: true },
        },
      },
      EventUpdate: {
        type: 'object',
        description: 'Any of the EventInput fields; at least one is required.',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          event_date: { type: 'string', format: 'date' },
          event_time: { type: 'string', example: '15:30' },
          venue_id: { type: 'integer' },
          capacity: { type: 'integer' },
          price: { type: 'number' },
          category_id: { type: 'integer' },
          image_url: { type: 'string', nullable: true },
        },
      },
      RejectInput: {
        type: 'object',
        required: ['reason'],
        properties: { reason: { type: 'string', minLength: 5, maxLength: 500, example: 'Please add a safety plan.' } },
      },
      Category: {
        type: 'object',
        properties: {
          category_id: { type: 'integer' },
          name: { type: 'string' },
          description: { type: 'string', nullable: true },
        },
      },
      CategoryInput: {
        type: 'object',
        properties: {
          name: { type: 'string', example: 'Hackathon' },
          description: { type: 'string', nullable: true, example: 'Coding competitions' },
        },
      },
      Venue: {
        type: 'object',
        properties: {
          venue_id: { type: 'integer' },
          name: { type: 'string' },
          location: { type: 'string' },
          capacity: { type: 'integer' },
        },
      },
      VenueInput: {
        type: 'object',
        properties: {
          name: { type: 'string', example: 'Test Hall' },
          location: { type: 'string', example: 'Block B, First Floor' },
          capacity: { type: 'integer', example: 50 },
        },
      },
      User: {
        type: 'object',
        properties: {
          user_id: { type: 'integer' },
          name: { type: 'string' },
          email: { type: 'string' },
          role: { type: 'string', enum: ['student', 'organizer', 'admin'] },
          is_super_admin: { type: 'boolean' },
          student_id_number: { type: 'string', nullable: true },
          programme: { type: 'string', nullable: true },
          org_name: { type: 'string', nullable: true },
          verified: { type: 'boolean' },
          access_level: { type: 'integer', nullable: true },
          is_active: { type: 'boolean' },
          created_at: { type: 'string', format: 'date-time' },
        },
      },
      ApiError: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          error: {
            type: 'object',
            properties: {
              code: { type: 'string', example: 'VALIDATION_ERROR' },
              message: { type: 'string' },
              details: { type: 'array', items: { type: 'object' } },
            },
          },
        },
      },
    },
    responses: {
      Error400: { description: 'Invalid input (VALIDATION_ERROR or a business rule)', content: { 'application/json': { schema: ref('ApiError') } } },
      Error401: { description: 'Not logged in, or the session expired', content: { 'application/json': { schema: ref('ApiError') } } },
      Error403: { description: 'Your role is not allowed to do this', content: { 'application/json': { schema: ref('ApiError') } } },
      Error404: { description: 'Not found', content: { 'application/json': { schema: ref('ApiError') } } },
      Error409: { description: 'Conflicts with the current state (for example EVENT_FULL, CATEGORY_IN_USE)', content: { 'application/json': { schema: ref('ApiError') } } },
      Error429: { description: 'Too many requests', content: { 'application/json': { schema: ref('ApiError') } } },
    },
  },
};