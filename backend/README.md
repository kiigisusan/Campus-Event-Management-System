# CEMS Backend

Express REST API for the Campus Event Management System.

## Run locally

```bash
cd backend
cp .env.example .env      # then fill in the values
npm install
npm run dev               # restarts on file changes
```

The API is served at `http://localhost:4000/api/v1`. Check it with
`GET /api/v1/health`.

| Script                | What it does                         |
| --------------------- | ------------------------------------ |
| `npm run dev`         | Start with auto-restart (`node --watch`) |
| `npm start`           | Start for production                 |
| `npm test`            | Jest + Supertest tests               |
| `npm run lint`        | ESLint                               |
| `npm run format`      | Prettier (write)                     |

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
