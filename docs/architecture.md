# Architecture

## System overview

CEMS is a single-page React app talking to a REST API, which stores everything in MySQL.
Two outside services are involved: Safaricom's M-Pesa Daraja API for payments, and an SMTP
server for email.

```mermaid
flowchart LR
    subgraph Browser
        SPA["React SPA<br/>(Vite, Tailwind, React Router)"]
    end

    subgraph Docker["Docker Compose"]
        API["Express API<br/>/api/v1"]
        JOB["Expiry job<br/>(inside the API process)"]
        DB[("MySQL 8.4<br/>cems_db")]
        MIG["migrate<br/>(Prisma, runs once)"]
    end

    MPESA["M-Pesa Daraja<br/>(STK Push)"]
    SMTP["SMTP server<br/>(optional)"]

    SPA -- "HTTPS + JSON<br/>Bearer JWT" --> API
    API -- "Prisma<br/>(least-privilege user)" --> DB
    JOB --> DB
    MIG -- "privileged user" --> DB
    API -- "STK push request" --> MPESA
    MPESA -- "payment callback" --> API
    API -- "QR tickets, 2FA codes,<br/>reset links, notices" --> SMTP
```

| Part        | Technology                                                    | Where                  |
| ----------- | ------------------------------------------------------------- | ---------------------- |
| Frontend    | React 18, Vite, Tailwind CSS, React Router, Axios, Recharts, html5-qrcode | `frontend/`  |
| API         | Node.js, Express, Zod validation, JWT, bcrypt, Helmet, Nodemailer, PDFKit | `backend/`   |
| Database    | MySQL 8.4 through Prisma ORM                                  | `backend/prisma/`      |
| Deployment  | Docker Compose: `db`, `migrate`, `backend`                    | `docker-compose.yml`   |
| CI          | GitHub Actions: lint, format, tests, frontend build           | `.github/workflows/`   |

## Backend layers

Every request goes through the same layers. Each layer has one job, so business rules live in
one place (the services) and can be tested without HTTP.

```mermaid
flowchart TD
    R["Route<br/>URL + middleware chain"] --> M["Middleware<br/>rate limit, authenticate, authorize(role), validate(Zod), audit"]
    M --> C["Controller<br/>reads the request, calls a service, sends the response"]
    C --> S["Service<br/>business rules, transactions"]
    S --> P["Prisma client"]
    P --> DB[("MySQL")]
    S -. "throws ApiError" .-> E["Error handler<br/>{ success: false, error: { code, message, fields } }"]
```

| Folder              | Contains                                                              |
| ------------------- | --------------------------------------------------------------------- |
| `src/routes/`       | One router per resource, mounted in `routes/index.js`                 |
| `src/middleware/`   | `authenticate`, `authorize`, `validate`, rate limiters, audit, errors |
| `src/controllers/`  | Thin HTTP handlers                                                    |
| `src/services/`     | Business logic: auth, events, bookings, payments, check-in, reports   |
| `src/validators/`   | Zod schemas for every request body and query                          |
| `src/jobs/`         | The pending-booking expiry job                                        |
| `src/docs/`         | OpenAPI spec served by Swagger UI at `/api/docs`                      |

Every response has the same shape: `{ success: true, data, meta? }` on success, and
`{ success: false, error: { code, message, fields? } }` on failure, so the frontend handles
errors in one place.

## Main API resources

| Resource              | Who                     | Purpose                                              |
| --------------------- | ----------------------- | ---------------------------------------------------- |
| `/auth`               | everyone                | Register, login, 2FA, logout, password reset          |
| `/events`             | public, organizers      | Browse approved events; organizers create and manage their own |
| `/categories`, `/venues` | public, admins       | Reference data; admins manage it                     |
| `/bookings`           | students                | Book, pay, view tickets, cancel                       |
| `/payments/mpesa/callback/:token` | Safaricom   | Payment results                                      |
| `/check-in`           | organizers              | Validate a QR ticket and mark it used                 |
| `/admin/events`       | admins                  | Approval queue                                       |
| `/admin/users`        | admins                  | User management                                      |
| `/reports`            | admins                  | Attendance, category and organizer reports (JSON and PDF) |
| `/audit-logs`         | admins                  | Audit trail (JSON and PDF)                           |

The full list, with request and response formats, is in Swagger at `/api/docs`.

## Booking and payment

Free events are confirmed at once. Paid events hold the seat while the student pays with
M-Pesa.

```mermaid
sequenceDiagram
    actor S as Student
    participant F as Frontend
    participant A as API
    participant D as MySQL
    participant M as M-Pesa

    S->>F: Book and pay
    F->>A: POST /bookings
    A->>D: Lock event row, check seats,<br/>create booking (pending, expires in 10 min),<br/>spots_remaining - 1
    A-->>F: booking (pending)
    S->>F: Enter phone number, Pay
    F->>A: POST /bookings/:id/pay
    A->>D: Create payment (pending)
    A->>M: STK Push request
    M-->>S: PIN prompt on phone
    S->>M: Enter PIN
    M->>A: POST /payments/mpesa/callback/:token
    alt payment succeeded
        A->>D: payment completed, booking confirmed
        A-->>S: Email with QR ticket
    else payment failed
        A->>D: payment failed (seat still held, student can retry)
    end
    loop every few seconds
        F->>A: GET /bookings/:id
        A-->>F: current status
    end
    Note over A,D: If nothing succeeds before expires_at, the expiry job<br/>cancels the booking and gives the seat back.
```

How the design keeps this correct:

- **No overbooking.** Booking locks the event row (`SELECT ... FOR UPDATE`) inside a
  transaction before checking and decrementing `spots_remaining`. A CHECK constraint also
  stops it going below 0.
- **Callbacks are idempotent.** A repeated callback finds the payment is no longer `pending`
  and changes nothing.
- **The callback URL is secret.** It contains `MPESA_CALLBACK_TOKEN`, so only Safaricom (who
  was given the URL) can post results.
- **Abandoned payments don't block seats.** The expiry job releases seats held past
  `expires_at`. Before expiring a booking it asks Safaricom for the result, in case a
  callback was lost.
- **Late money isn't lost.** A payment that arrives after expiry re-takes a seat if one is
  free, or is flagged for refund.

## QR check-in

```mermaid
sequenceDiagram
    actor O as Organizer
    participant F as Frontend (scanner)
    participant A as API
    participant D as MySQL

    O->>F: Scan student's QR code
    F->>A: POST /check-in { qr_code, event_id }
    A->>D: Find booking by qr_code
    alt valid ticket for this organizer's event
        A->>D: UPDATE booking SET status = checked_in<br/>WHERE status = confirmed
        A-->>F: Checked in (student name)
    else already used, wrong event, cancelled or unknown
        A-->>F: Refused, with the reason
    end
```

The QR code holds a random, unguessable token (not a booking ID). The check-in is one
conditional `UPDATE`, so even two scanners reading the same ticket at the same moment cannot
both succeed.

## Status lifecycles

### Event

```mermaid
stateDiagram-v2
    [*] --> draft: organizer creates
    draft --> pending: organizer submits
    pending --> approved: admin approves
    pending --> rejected: admin rejects (with reason)
    rejected --> draft: organizer edits
    draft --> cancelled: organizer cancels
    pending --> cancelled: organizer cancels
    approved --> cancelled: organizer cancels<br/>(students emailed)
    approved --> [*]
    cancelled --> [*]
```

Only `approved` events are visible to students and open for booking.

### Booking

```mermaid
stateDiagram-v2
    [*] --> confirmed: free event
    [*] --> pending: paid event (seat held)
    pending --> confirmed: M-Pesa payment succeeds
    pending --> cancelled: student cancels, or hold expires
    confirmed --> cancelled: student cancels before the event
    confirmed --> checked_in: QR scanned at the door
    cancelled --> pending: student books again (paid)
    cancelled --> confirmed: student books again (free)
    checked_in --> [*]
```

A student has at most one booking row per event; booking again re-uses the cancelled row.

## Security

| Concern                 | How it is handled                                                                   |
| ----------------------- | ----------------------------------------------------------------------------------- |
| Passwords               | bcrypt hashes; never returned by the API                                            |
| Sessions                | Short-lived JWTs, renewed while active; logged out after 30 minutes idle            |
| Logout and revocation   | Each user has a `token_version`; logout, password change, deactivation and role change bump it, so old tokens stop working at once |
| Admin login             | Email one-time code (2FA) after the password; configurable per role                  |
| Access control          | `authorize(role)` on every protected route; organizers only see and scan their own events; only super admins manage admins |
| Brute force             | Rate limits on login, 2FA, password reset and registration                          |
| Input                   | Every body and query validated with Zod; request size limited to 100 KB             |
| HTTP headers and CORS   | Helmet; CORS only allows the frontend's origin (`CLIENT_URL`)                       |
| Password reset          | Single-use link; only a SHA-256 hash of the token is stored; expires in 30 minutes  |
| Database                | The API connects as a least-privilege user (read/write rows only); migrations use a separate privileged account |
| Accountability          | Audit log of logins, bookings, payments, check-ins, approvals and user changes      |
| Secrets                 | `.env` files are gitignored; `.env.example` files document every setting            |

## Testing

- **Backend:** Jest and Supertest, 18 suites and 188 tests, run against a real MySQL test
  database (`cems_test`) so transactions, locks and constraints are tested for real. The test
  setup refuses any database whose name doesn't end in `_test`.
- **Frontend:** ESLint and a production build.
- **CI:** both run on every push and pull request (`.github/workflows/ci.yml`).
