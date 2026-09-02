# Deployment

Same pattern as the other portfolio projects: **Vercel** (client) + **Render**
(API + Postgres).

## 1. Database + API — Render

1. Push this repo to GitHub.
2. Render ▸ **New ▸ Blueprint** → pick the repo. `render.yaml` provisions
   `fleet-db` (Postgres) and `fleet-api` (web service, `rootDir: server`).
3. The build runs `prisma migrate deploy` and applies `sql/views.sql`. It does
   **not** seed — every redeploy leaves existing rows (including the
   append-only `IntegrationEvent` log) untouched.
4. Set the `sync: false` env vars in the Render dashboard:
   - `CLIENT_ORIGIN`, `DASHBOARD_BASE_URL` → the Vercel URL (from step 2 below)
   - `TICKET_TRACKER_BASE_URL` → the deployed IT ticketing API
   - `INTEGRATION_API_KEY` → **must match** the ticketing system's own `INTEGRATION_API_KEY`
5. Seed once (Render ▸ Shell, from `server/`):
   `node prisma/seed.js --force` — the `--force` is required because the script
   refuses to wipe a non-local database without it. Needs
   `server/prisma/seed-data.json`, so run `python data/generate_sample_data.py`
   locally first and commit it, or run the generator in the shell. Run this only
   on first setup or a deliberate reset — never as part of a deploy.
6. Health check: `GET https://<fleet-api>.onrender.com/health`.

## 2. Client — Vercel

1. Vercel ▸ **Add New ▸ Project** → same repo, **root directory `client`**.
   `client/vercel.json` sets framework/build/output and SPA rewrites.
2. Env var: `VITE_API_BASE_URL = https://<fleet-api>.onrender.com`.
3. Deploy. Update Render's `CLIENT_ORIGIN` / `DASHBOARD_BASE_URL` to this URL and
   redeploy the API.

## 3. Scheduled pipeline

Render has no Task Scheduler. Enable `.github/workflows/fleet-pipeline.yml` and add
repo secrets `DATABASE_URL` (the Render external connection string) and
`FLEET_API_BASE` (the Render API URL). It runs ingest → report → evaluate daily.

## 4. Power BI

`powerbi/BUILD_GUIDE.md`. Point the `DbServer` / `DbName` parameters at the Render
Postgres external host, refresh, publish to the Power BI Service, and add
scheduled refresh.
