# CEMS Frontend

React + Vite + Tailwind single-page app for the Campus Event Management System.

## Run locally

1. Start the API (from the repo root): `docker compose up -d --build`
   (add `docker compose run --rm migrate npx prisma db seed` once for demo data).
2. Then:

```bash
cd frontend
cp .env.example .env      # VITE_API_URL, default http://localhost:4000/api/v1
npm install
npm run dev               # http://localhost:5173
```

`CLIENT_URL` in the root `.env` must match the address you open (default `http://localhost:5173`),
or the browser will block requests with a CORS error.

Demo logins are in `backend/README.md` (password `Password123!`). Admin logins need an emailed
6-digit code; with no SMTP set up, the code is printed in the backend logs
(`docker compose logs backend`).

## Structure

```
src/
├── lib/          api.js (Axios + token handling), format, validate, useAsync hooks
├── context/      AuthContext (session), ToastContext (messages)
├── components/   ui.jsx (shared kit), Layout (navbar/sidebar/guards), Tour, TicketQR
└── pages/
    ├── public/     Home, EventDetail, Login (+2FA), Register, password reset, Help, 403/404
    ├── student/    BookingPage (M-Pesa + polling + QR), MyBookings
    ├── organizer/  Dashboard, EventForm, Scanner, Analytics
    └── admin/      Dashboard, Approvals, Users, Catalog, Reports, AuditLog
```

## Conventions

- Every API call goes through `lib/api.js`. Do not call `axios` directly.
- Wrap submit handlers in `useSubmit` and pass `busy` to `<Button loading>`: it blocks double submits.
- Check inputs on the client with `lib/validate.js` first, then show backend messages from `fieldErrors(err)`.
- Colours and fonts come from `tailwind.config.js` (`jacaranda` = brand, `acacia` = success,
  `sunbird` = warning, `rose` = error, `ink` = text and surfaces).

## Deployment (for Member 1)

`Dockerfile` builds the app and serves it with nginx on port 80, with single-page-app routing.
`VITE_API_URL` is baked in at build time, so pass the public API address:

```bash
docker build --build-arg VITE_API_URL=https://api.example.com/api/v1 -t cems-frontend .
```

Then set the backend's `CLIENT_URL` to the frontend's public address. To run it in Compose, uncomment
the `frontend` service in the root `docker-compose.yml` (build: `./frontend`).
