# Installation guide

This sets up the whole system on one computer: the MySQL database and API in Docker, and the
React frontend with Vite.

## 1. Requirements

| Tool           | Version   | Used for                                 |
| -------------- | --------- | ---------------------------------------- |
| Git            | any       | Getting the code                         |
| Docker Desktop | recent    | MySQL, database migrations and the API   |
| Node.js        | 20 or 22  | Running the frontend (and the API without Docker) |

Check with `git --version`, `docker --version` and `node -v`. Docker Desktop must be running
before you start.

## 2. Get the code

```bash
git clone https://github.com/kiigisusan/Campus-Event-Management-System.git
cd Campus-Event-Management-System
```

## 3. Start the database and API

```bash
cp .env.example .env
```

Open `.env` and set `MYSQL_ROOT_PASSWORD` and `MYSQL_APP_PASSWORD`. Use letters and digits only,
because the passwords are put inside database connection URLs. If MySQL is already installed on
your computer and using port 3306, also set `DB_PORT=3307`.

```bash
docker compose up -d --build
```

This starts three containers in order:

1. `db`: MySQL 8.4. On first start it creates `cems_db` and a least-privilege app user.
2. `migrate`: applies the Prisma migrations (creates the tables), then exits.
3. `backend`: the Express API on port 4000.

Check it worked: open http://localhost:4000/api/v1/health/ready. It should say
`"status":"ok"`.

### Add demo data

```bash
docker compose run --rm migrate npx prisma db seed
```

This adds demo users, categories, venues, about 25 events in every status, bookings, M-Pesa
payments and audit log entries. It is safe to run again: nothing is duplicated.

## 4. Start the frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Open the address Vite prints, usually http://localhost:5173. The default `.env` points the
frontend at the API on `http://localhost:4000/api/v1`.

## 5. Log in

Every demo account uses the password `Password123!`.

| Email                                         | Role                                   |
| --------------------------------------------- | -------------------------------------- |
| `superadmin@cems.test`                        | Super admin (can also manage admins)   |
| `admin@cems.test`                             | Admin                                  |
| `organizer@cems.test`                         | Organizer, Computer Science Club       |
| `organizer2@cems.test`                        | Organizer, Career Development Office   |
| `organizer3@cems.test`                        | Organizer, Student Council             |
| `organizer4@cems.test`                        | Organizer, Drama Society (unverified)  |
| `student@cems.test` to `student17@cems.test`  | Students                               |
| `student18@cems.test`                         | Student, deactivated (cannot log in)   |

**Admins need a 6-digit code after their password.** With no email server configured (the
default), emails are not sent; they are printed in the API's log instead. To see the code:

```bash
docker compose logs -f backend
```

Password reset links appear in the same log.

## 6. Payments in development

`MPESA_MODE=mock` (the default) simulates M-Pesa, so no Safaricom account is needed. The
payment completes a few seconds after you pay. Special phone numbers let you test failures:

| Phone number  | Result                |
| ------------- | --------------------- |
| `0700000000`  | Customer cancels      |
| `0711111111`  | Insufficient funds    |
| anything else | Payment succeeds      |

To use the real Safaricom sandbox instead, set `MPESA_MODE=sandbox` and the Daraja keys in
`backend/.env` (see the comments in [backend/.env.example](../backend/.env.example)).

## 7. Stopping and resetting

| Task                                     | Command                                                  |
| ---------------------------------------- | -------------------------------------------------------- |
| Stop everything (keeps the data)         | `docker compose down`                                    |
| Stop and delete the database             | `docker compose down -v`                                 |
| Rebuild the API after pulling new code   | `docker compose up -d --build`                           |
| See the API log                          | `docker compose logs -f backend`                         |

## Running the API without Docker

For backend development with auto-reload, run only the database in Docker
(`docker compose up -d db`) and follow [backend/README.md](../backend/README.md).

## Troubleshooting

| Problem                                              | Fix                                                                                     |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `npm install` says it cannot find `package.json`     | Run it inside `frontend/` or `backend/`, not the project root.                          |
| `docker compose` cannot connect to the Docker API    | Start Docker Desktop and wait until it says it is running.                              |
| Port 3306 is already in use                          | Set `DB_PORT=3307` in the root `.env`, then `docker compose up -d`.                     |
| The frontend shows network errors                    | Check the API is up (`/api/v1/health/ready`) and `VITE_API_URL` in `frontend/.env`.     |
| New API features are missing after `git pull`        | Rebuild the containers: `docker compose up -d --build`.                                  |
| An admin never gets the 2FA code                     | Read it from `docker compose logs backend` (no email server is set up by default).      |
