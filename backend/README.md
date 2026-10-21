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
├── services/         Business logic and database access (mpesa/ = Daraja client)
├── jobs/             Background jobs (unpaid booking expiry)
├── middleware/       validate, errorHandler, notFound, authenticate/authorize, audit, rateLimiters
├── validators/       Zod schemas per feature (+ common.js)
├── utils/            ApiError, response helpers, tokens, publicUser
├── emails/           Email templates
└── constants/        AUDIT_ACTIONS
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

## Authentication

All under `/api/v1/auth`.

| Method & path           | Body                                        | Notes                                    |
| ----------------------- | ------------------------------------------- | ---------------------------------------- |
| `POST /register`        | `name, email, password, role` + `student_id_number` (student) or `org_name` (organizer) | Students and organizers only. Returns `{ token, user }` |
| `POST /login`           | `email, password`                           | See the two possible responses below     |
| `POST /2fa/verify`      | `twoFactorToken, code`                      | Second login step for admins             |
| `POST /logout`          | (auth)                                      | Ends every session of the user           |
| `GET /me`               | (auth)                                      | The logged-in user                       |
| `POST /forgot-password` | `email`                                     | Always 200; emails a reset link if the account exists |
| `POST /reset-password`  | `token, password`                           | Token comes from the link `CLIENT_URL/reset-password?token=...` |

**Login responses**

```jsonc
// students and organizers
{ "success": true, "data": { "twoFactorRequired": false, "token": "...", "user": { ... } } }
// admins: show a "enter the code we emailed" screen, then POST /auth/2fa/verify
{ "success": true, "data": { "twoFactorRequired": true, "twoFactorToken": "...", "sentTo": "a***n@cems.test", "expiresInMinutes": 10 } }
```

**For the frontend (Member 3)**

- Send the token on every request: `Authorization: Bearer <token>`.
- If a response has an `X-Access-Token` header, replace the stored token with it. This is how
  the 30-minute inactivity timeout works: active users keep getting fresh tokens.
- On `401` with code `SESSION_EXPIRED`, `SESSION_REVOKED` or `INVALID_TOKEN`, clear the token
  and redirect to the login page with the error message.
- `429 TOO_MANY_REQUESTS` means rate limited (5 failed logins per account per 15 minutes).

Axios example:

```js
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
api.interceptors.response.use((response) => {
  const renewed = response.headers['x-access-token'];
  if (renewed) localStorage.setItem('token', renewed);
  return response;
});
```

**Protecting routes (Member 1)**

```js
import { authenticate, authorize } from '../middleware/authenticate.js';
import { audit } from '../middleware/audit.js';
import { AUDIT_ACTIONS } from '../constants/auditActions.js';

router.patch(
  '/:id/approve',
  authenticate,                       // must be logged in -> req.user
  authorize('admin'),                 // 'student' | 'organizer' | 'admin' | 'super_admin'
  validate({ params: idParamsSchema() }),
  audit(AUDIT_ACTIONS.APPROVE_EVENT, 'event'), // logged only if the request succeeds
  controller.approve,
);
```

- `authorize('admin')` also lets super admins in; `authorize('super_admin')` is super admins only.
- Send users to the client with `toPublicUser(user)` from `utils/publicUser.js`, never raw rows.
- Hash passwords with `hashPassword()` from `services/authService.js`.
- After changing a user's password or deactivating them, increment `token_version` so their
  existing sessions end.

## Bookings and M-Pesa payments

| Method & path                  | Who      | Body / query                 | Notes                                        |
| ------------------------------ | -------- | ---------------------------- | -------------------------------------------- |
| `POST /bookings`               | student  | `event_id`                   | Free: `confirmed`. Paid: `pending`, seat held for 10 min |
| `POST /bookings/:id/pay`       | student  | `phone_number` (e.g. `0712345678`) | Sends the M-Pesa PIN prompt (202). Also used to retry |
| `GET /bookings/:id`            | owner / admin |                         | Poll this while waiting for payment           |
| `GET /bookings/me`             | student  | `?status=&page=&pageSize=`   | My Bookings page                              |
| `PATCH /bookings/:id/cancel`   | student  |                              | Before the event starts; seat is released     |
| `POST /payments/mpesa/callback/:token` | Safaricom |                   | Server-to-server, not called by the frontend  |

**Paid booking flow for the frontend (Member 3)**

1. `POST /bookings` → `booking.status === 'pending'`, show the countdown to `booking.expires_at`.
2. Ask for the phone number → `POST /bookings/:id/pay`. Disable the Pay button while waiting.
3. Poll `GET /bookings/:id` every 3 seconds:
   - `status: 'confirmed'` → success page; `qr_code` is now set (render it / show the ticket).
   - `payment.status: 'failed'` → show `payment.result_desc` and a **Retry** button (step 2 again).
   - `status: 'cancelled'` (hold expired) → "Your reservation expired, please book again".
4. Error codes to handle: `EVENT_FULL`, `ALREADY_BOOKED`, `PAYMENT_IN_PROGRESS`,
   `BOOKING_EXPIRED`, `MPESA_UNAVAILABLE` (seat still held, retry).

`qr_code` is `null` until a booking is confirmed, so an unpaid booking never has a ticket.

**Mock mode** (`MPESA_MODE=mock`, the default) needs no Daraja keys. About 4 seconds after
paying, the result is simulated from the phone number:
`0700000000` → cancelled by user, `0711111111` → insufficient funds, anything else → success.

**Sandbox mode**: set `MPESA_MODE=sandbox`, the Daraja keys, and a public HTTPS
`MPESA_CALLBACK_BASE_URL` that Safaricom can reach (e.g. `ngrok http 4000`).

**Guarantees** (see `services/bookingService.js` and `services/paymentService.js`):
every seat change locks the event row first, so events are never overbooked; repeated
M-Pesa callbacks change nothing; unpaid holds are released by a job every minute; money
arriving after a hold expired re-takes a free seat or is flagged `PAYMENT_REFUND_REQUIRED`.

## Email

With `SMTP_HOST` empty (the default in development), emails are **not sent**: they are printed
in the backend terminal, including reset links and 2FA codes. Set the `SMTP_*` variables in
`.env` to send real email.

## Tests

Database tests need a separate test database. Add to `backend/.env`:

```
TEST_DATABASE_URL=mysql://root:<root password>@localhost:3306/cems_test
```

The name must end in `_test`; the tests delete all its rows. Migrations are applied to it
automatically when `npm test` starts. Without `TEST_DATABASE_URL`, database tests are skipped.
