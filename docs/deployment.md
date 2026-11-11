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

## Limits of the free hosting

- **Cold start.** Open the site a few minutes before presenting so the API is awake.
- **Emails may not be sent.** Free Render instances are believed to block outbound email, so with
  no SMTP configured the API prints emails to its log. Password-reset links and 2FA codes appear
  under `cems-api` > **Logs**. Admin accounts use 2FA by default, so keep that tab open when
  logging in as an admin.
- **Payments are simulated.** `MPESA_MODE=mock`. Real M-Pesa needs the Safaricom sandbox keys
  and the public API address as `MPESA_CALLBACK_BASE_URL`.
- **One database account.** The free database gives one user, so the API and migrations share it,
  unlike the local Docker setup, which uses a least-privilege app user.
