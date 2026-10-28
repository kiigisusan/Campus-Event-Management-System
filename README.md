# Campus Event Management System (CEMS)

A web platform where students browse and book campus events, organizers create
events and check students in with QR codes, and admins approve events and
monitor activity. Paid events are paid through M-Pesa (Daraja STK Push).

## Tech stack

| Layer    | Technology                                             |
| -------- | ------------------------------------------------------ |
| Backend  | Node.js, Express, Prisma ORM, Zod, JWT, bcrypt         |
| Database | MySQL 8 (`cems_db`)                                    |
| Frontend | React, Vite, Tailwind CSS, React Router, Axios         |
| Other    | M-Pesa Daraja, qrcode, html5-qrcode, Nodemailer, Recharts |
| Tooling  | ESLint, Prettier, Jest + Supertest, Docker Compose     |

## Repository layout

```
.
├── backend/     Express REST API (routes → controllers → services → Prisma)
├── frontend/    React + Vite single-page app
├── docs/        Diagrams, schema notes, user manual
├── docker/      MySQL init script (creates the least-privilege app user)
└── docker-compose.yml   MySQL + migrations + API in one command
```

## Getting started (Docker)

Requires Docker Desktop.

```bash
cp .env.example .env          # set the passwords (letters and digits only)
docker compose up -d --build  # MySQL, then migrations, then the API
docker compose run --rm migrate npx prisma db seed   # optional: demo data
```

- API health: http://localhost:4000/api/v1/health/ready
- Stop: `docker compose down` (add `-v` to also delete the database volume)
- If MySQL is already installed on your machine and using port 3306, set `DB_PORT=3307`
  in `.env`.

To work on the API with auto-reload instead, run only the database in Docker
(`docker compose up -d db`) and follow [backend/README.md](backend/README.md).

## Team and ownership

| Member                  | Branch  | Owns                                                                                |
| ----------------------- | ------- | ----------------------------------------------------------------------------------- |
| Member 1: Ida Ndege     | `Ida`   | Events & admin APIs, categories/venues, Swagger, tests, deployment, docs           |
| Member 2: Favor Vincent | `Favor` | Foundation, DB schema, auth & security, booking, M-Pesa, QR, reports, audit, emails |
| Member 3: Susan Kiigi   | `Susan` | Frontend: design system, student/organizer/admin pages                              |

## Git workflow

```
your branch ──commit──► push ──merge──► TestBranch ──(all checks pass)──► main
```

| Branch          | Purpose                                                                           |
| --------------- | --------------------------------------------------------------------------------- |
| your own branch | Day-to-day work. Commit small, focused changes and push them here.                |
| `TestBranch`    | Integration branch. Everyone's work is merged here and tested together.           |
| `main`          | Stable, working code only. Updated from `TestBranch`, never committed to directly. |

1. Work on your own branch and commit small, focused changes with clear messages,
   e.g. `feat(auth): add login endpoint`.
2. Push your branch, then merge it into `TestBranch` (open a pull request from your branch into `TestBranch`).
   Pull the latest `TestBranch` into your branch first so conflicts are fixed on your side.
3. On `TestBranch`, check that the app starts and `npm run lint` and `npm test` pass for the whole system.
4. Once everything is working on `TestBranch`, merge `TestBranch` into `main`.

Commit message prefixes: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`.

## Coding conventions

- **Files:** `camelCase.js` for modules (`bookingService.js`), `PascalCase.jsx` for React components.
- **Variables and functions:** `camelCase`. **Constants:** `UPPER_SNAKE_CASE`.
- **Database columns** use `snake_case`, matching the schema document.
- **Backend layering:** routes only wire URLs to middleware and controllers; controllers handle
  HTTP (request in, response out); services hold business logic and talk to Prisma.
- Comment the _why_ of non-obvious logic; use JSDoc on exported service functions.
- Run `npm run format` before committing. ESLint and Prettier configs are shared.
- Never commit `.env` files or secrets. Copy `.env.example` to `.env` and fill it in locally.
