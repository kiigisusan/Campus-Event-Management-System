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
└── docker-compose.yml   (added with the backend foundation)
```

## Team and ownership

| Member                  | Branch  | Owns                                                                                |
| ----------------------- | ------- | ----------------------------------------------------------------------------------- |
| Member 1 (_name_)       | _TBD_   | Events & admin APIs, categories/venues, Swagger, tests, deployment, docs           |
| Member 2: Favor Vincent | `Favor` | Foundation, DB schema, auth & security, booking, M-Pesa, QR, reports, audit, emails |
| Member 3 (_name_)       | _TBD_   | Frontend: design system, student/organizer/admin pages                              |

## Git workflow

1. `main` holds stable, reviewed code only. Never commit to it directly.
2. Each member works on their own branch, created from `main`.
3. Commit small, focused changes with clear messages, e.g. `feat(auth): add login endpoint`.
4. Before opening a pull request, merge the latest `main` into your branch and make sure
   `npm run lint` and `npm test` pass.
5. Open a pull request into `main`; at least one other member reviews it before it is merged.

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
