# CEMS Backend

Express REST API for the Campus Event Management System.

## Run locally

1. Start MySQL. The easiest way is the Docker database (see the root README):
   `docker compose up -d db` from the repo root.
2. Set up and run the API:

```bash
cd backend
cp .env.example .env      # use the same passwords/port as the root .env
npm install               # also generates the Prisma client
npm run db:deploy         # create the tables
npm run db:seed           # demo data (optional)
npm run dev               # restarts on file changes
```

The API is served at `http://localhost:4000/api/v1`.
`GET /api/v1/health` checks the API, `GET /api/v1/health/ready` also checks the database.

| Script               | What it does                                                |
| -------------------- | ----------------------------------------------------------- |
| `npm run dev`        | Start with auto-restart (`node --watch`)                    |
| `npm start`          | Start for production                                        |
| `npm test`           | Jest + Supertest tests                                      |
| `npm run lint`       | ESLint                                                      |
| `npm run format`     | Prettier (write)                                            |
| `npm run db:migrate` | Create a new migration after editing `schema.prisma` (dev)  |
| `npm run db:deploy`  | Apply pending migrations                                    |
| `npm run db:seed`    | Insert demo data (safe to re-run)                           |
| `npm run db:reset`   | Drop everything, re-migrate and re-seed (dev only)          |
| `npm run db:studio`  | Browse the data in Prisma Studio                            |

### Demo accounts (seed data)

All use the password `Password123!`.

| Email                  | Role                     |
| ---------------------- | ------------------------ |
| `superadmin@cems.test` | Admin, super admin (access_level 2) |
| `admin@cems.test`      | Admin (access_level 1)   |
| `organizer@cems.test`  | Organizer                |
| `organizer2@cems.test` | Organizer                |
| `student@cems.test`    | Student                  |
| `student2@cems.test`   | Student                  |
| `student3@cems.test`   | Student                  |

## Database

- Schema: [prisma/schema.prisma](prisma/schema.prisma). It follows the Deliverable 2 schema;
  columns marked `ADDED` were introduced for password reset, 2FA, M-Pesa and payment expiry.
- CHECK constraints (capacity > 0, 0 ≤ spots_remaining ≤ capacity, price ≥ 0, amount > 0)
  are written by hand at the end of the init migration, because Prisma cannot express them.
- **Two database accounts:** `DATABASE_URL` is the least-privilege app user (it can only
  read/write rows); `MIGRATION_DATABASE_URL` is the privileged account Prisma uses for
  migrations.
- **Changing the schema:** only one person (Member 2) edits `schema.prisma` and creates
  migrations, so migration files never conflict between branches. Ask for a change instead
  of editing it on your own branch.
- Use the Prisma client from `src/config/prisma.js`. Never build SQL with string
  concatenation; raw queries must use the tagged form ``prisma.$queryRaw`... ${value}` ``.

## Folder structure

```
src/
├── app.js            Express app (middleware + routes); imported by tests
├── server.js         Starts the HTTP server, graceful shutdown
├── config/           env.js (validated settings)
├── routes/           URL → middleware → controller wiring, one file per feature
├── controllers/      HTTP layer: read req.validated, call a service, send response
├── services/         Business logic and database access
├── middleware/       validate, errorHandler, notFound (auth, roles, audit to come)
├── validators/       Zod schemas per feature (+ common.js)
└── utils/            ApiError, response helpers
tests/                Jest + Supertest
```

## API conventions (everyone must follow these)

**Success response**

```json
{ "success": true, "data": { ... }, "meta": { "page": 1, "pageSize": 20, "total": 57, "totalPages": 3 } }
```

Use `sendSuccess(res, data, { meta })` or `sendCreated(res, data)` from `utils/response.js`.
`meta` is only present on paginated lists (build it with `paginationMeta()`).

**Error response**

```json
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "Some fields are invalid",
  "details": [{ "field": "email", "message": "Invalid email address" }] } }
```

- Throw `ApiError` from services, e.g. `throw ApiError.notFound('Event not found')` or
  `throw ApiError.conflict('Event is full', 'EVENT_FULL')`. Never send error JSON by hand.
- No `try/catch` needed in controllers: Express 5 forwards async errors to the error handler.
- Prisma unique / foreign-key / not-found errors are converted automatically (409 / 409 / 404).

**Validation**: every route validates its input with Zod:

```js
router.get('/:id', validate({ params: idParamsSchema() }), controller.getById);
```

Read the parsed values from `req.validated.params / .query / .body` (Express 5 makes
`req.query` read-only, and the parsed values have the right types, e.g. numbers).

**Pagination**: list endpoints accept `?page=&pageSize=` (`paginationSchema`, max 100 per page).
