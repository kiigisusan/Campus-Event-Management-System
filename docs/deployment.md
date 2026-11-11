# Deployment (free: TiDB Cloud + Render + Vercel)

The live system runs on free tiers:

| Part | Where | Notes |
|---|---|---|
| Database | TiDB Cloud Starter (MySQL-compatible) | No card needed |
| API | Render, Docker web service | Sleeps after 15 min idle; first request takes 30-60 s |
| Web app | Vercel | Always on |

The API is described in [render.yaml](../render.yaml) and the web app's routing in
[frontend/vercel.json](../frontend/vercel.json). For a local setup see the
[installation guide](installation-guide.md).

## 1. Create the database

1. Sign up at https://tidbcloud.com and create a **Starter** cluster.
2. Open **SQL Editor** and run `CREATE DATABASE cems_db;`
3. In **Connect**, choose "Prisma" or "General" and note the host, port (4000), username and
   password. Build the connection string (URL-encode special characters in the password):

   ```
   mysql://USERNAME:PASSWORD@HOST:4000/cems_db?sslaccept=strict
   ```

## 2. Deploy the API on Render

1. Sign up at https://render.com (GitHub login is easiest).
2. **New > Blueprint**, paste the public repo URL, choose the branch to deploy.
3. When asked for the variables:
   - `DATABASE_URL` and `MIGRATION_DATABASE_URL`: the connection string from step 1 (same value).
   - `CLIENT_URL`: you do not know it yet. Enter a placeholder such as `https://placeholder.vercel.app`.
4. Wait for the deploy. The API applies the database migrations automatically when it starts.
   Note its address (for example `https://cems-api.onrender.com`) and check
   `<address>/api/v1/health` in a browser.

## 3. Deploy the web app on Vercel

1. Sign up at https://vercel.com (GitHub login is easiest).
2. **Add New > Project**, import the repository, and set **Root Directory** to `frontend`.
   Vercel detects Vite by itself.
3. Add an environment variable **`VITE_API_URL`** = the Render address + `/api/v1`
   (for example `https://cems-api.onrender.com/api/v1`).
4. Deploy, then note the production address (for example `https://cems.vercel.app`).

## 4. Connect the two

In Render, open `cems-api` > Environment and set `CLIENT_URL` to the Vercel production address
(no trailing slash). Render redeploys by itself. This tells the API to accept requests from the
web app (CORS) and is used for links in emails.

Share only the production address. Vercel's per-deployment preview addresses are not allowed by CORS.

## 5. Add demo data

Run this once on your own computer (needs the repo and `npm install` in `backend/`). It writes
straight to the hosted database:

```powershell
cd backend
$env:NODE_ENV = "development"   # the seed script refuses to run as "production"
$env:DATABASE_URL = "mysql://USERNAME:PASSWORD@HOST:4000/cems_db?sslaccept=strict"
$env:MIGRATION_DATABASE_URL = $env:DATABASE_URL
npx prisma db seed
```

The demo accounts are listed in the [installation guide](installation-guide.md#5-log-in).

## 6. Email and M-Pesa (sandbox)

Both use test services, so nothing real is sent or charged. Set these on `cems-api` >
Environment (the secret ones are never stored in the repo).

**Email: Mailtrap Email Sandbox.** Mailtrap catches every email in a web inbox instead of
delivering it. Render's free tier blocks the usual SMTP ports (25, 465, 587), so use port 2525.
Open your inbox in Mailtrap, then **Integration > Nodemailer** shows the values:

| Variable | Value |
|---|---|
| `SMTP_HOST` | the host Mailtrap shows (for example `sandbox.smtp.mailtrap.io`) |
| `SMTP_PORT` | `2525` |
| `SMTP_USER` / `SMTP_PASS` | the credentials Mailtrap shows |

Booking confirmations, password-reset links and admin 2FA codes then appear in the Mailtrap inbox.

**M-Pesa: Safaricom Daraja sandbox.** Create an app on https://developer.safaricom.co.ke and set:

| Variable | Value |
|---|---|
| `MPESA_MODE` | `sandbox` |
| `MPESA_CONSUMER_KEY` / `MPESA_CONSUMER_SECRET` | from your Daraja app |
| `MPESA_SHORTCODE` | `174379` |
| `MPESA_PASSKEY` | the passkey on the Daraja "M-Pesa Express" simulator page |
| `MPESA_CALLBACK_BASE_URL` | the API address, for example `https://cems-api-5md3.onrender.com` (no trailing slash) |
| `MPESA_CALLBACK_TOKEN` | any random string of 16+ letters and digits |

Safaricom posts the payment result to `<MPESA_CALLBACK_BASE_URL>/api/v1/payments/mpesa/callback/<MPESA_CALLBACK_TOKEN>`.

## Limits of the free hosting

- **Cold start.** Open the site a few minutes before presenting so the API is awake.
- **Emails go to Mailtrap, not to real inboxes.** Delivering to real addresses needs a verified
  sending domain.
- **Sandbox payments use test money.** The Daraja sandbox does not send a real prompt to a phone.
- **One database account.** The free database gives one user, so the API and migrations share it,
  unlike the local Docker setup, which uses a least-privilege app user.
