# Fleet Asset Tracking & Predictive Analytics

A full-stack platform for tracking heavy-equipment fleets on mine sites. It
combines a React/Node operational dashboard, a Python analytics and Excel
pipeline, a Power BI reporting model, PowerShell scheduled automation, and an
HTTP integration that opens tickets in a separate
[IT Help Desk Ticketing system](https://github.com/mahir-alam/it-helpdesk-ticketing-system)
when equipment crosses a maintenance threshold.

## What it does

- Tracks utilization, fuel use (litres and cost per engine-hour), unplanned
  downtime, MTBF / MTTR / availability, and service-interval status for every
  asset in the fleet.
- Runs a threshold engine (`server/src/modules/alerts/rules.js`) that raises a
  `MaintenanceFlag` for each breach. Three kinds — `SERVICE_OVERDUE`,
  `EXCESSIVE_DOWNTIME`, `HIGH_FUEL_BURN` — also POST to the ticketing system's
  `/api/tickets/auto-create` endpoint and record an `IntegrationEvent` for the
  audit trail.
- Moves data through Excel in both directions: a raw fleet workbook is ingested
  into Postgres, and a formatted summary is written back out to `.xlsx`.
- Exposes the same SQL views to a Power BI semantic model (TMDL) for historical
  and executive reporting, kept separate from the operational dashboard.
- Ships the pipeline as a PowerShell script for Windows Task Scheduler, with an
  equivalent GitHub Actions workflow for the cloud.

## Stack

React, Node, Express, Prisma, PostgreSQL, Python (openpyxl / SQLAlchemy), Excel,
Power BI, PowerShell, `node:test`. Deploys to Vercel (client) and Render
(API + Postgres).

## Quick start

Requires Docker, Node 20+, and Python 3.10+.

```bash
cp .env.example .env
npm install
pip install -e ./analytics

docker compose up -d db
npm --workspace server run prisma:migrate
npm --workspace server run db:views
python data/generate_sample_data.py
npm --workspace server run seed

npm run dev            # API on :4000, dashboard on :5173
```

In the dashboard, use **Refresh evaluation** to scan the fleet (raises 5 flags
and creates 3 tickets on the sample data). **Send test alert** simulates a
single alert for a chosen asset without contacting a real ticketing system.
Results appear on the **Alerts & Tickets** page.

## Data pipelines

```bash
# Excel: ingest the raw workbook, then export a summary
python -m fleet_analytics ingest --file data/raw/fleet_raw_sample.xlsx
python -m fleet_analytics report        # -> data/exports/fleet-summary-<date>.xlsx

# Full scheduled pipeline, run once
pwsh automation/Invoke-FleetPipeline.ps1 -ApiBase http://localhost:4000
```

`data/generate_sample_data.py` produces a deterministic dataset (fixed RNG seed,
90-day window ending yesterday), so the flag and ticket counts above are
repeatable.

## Tests

```bash
npm --workspace server test        # 22 tests, no database or network
cd analytics && python -m pytest -q # 11 tests
```

## Seeding and deploys

`npm run seed` wipes the database and reloads the sample data. It refuses to run
against a non-local database unless passed `--force`, and no build or migration
step ever runs it — seeding is always a deliberate manual action. See
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Docs

| File | Contents |
| --- | --- |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | layers, data flow, alert engine |
| [`docs/INTEGRATION.md`](docs/INTEGRATION.md) | the ticketing contract, verified against source |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | Vercel + Render |
| [`docs/VERIFICATION.md`](docs/VERIFICATION.md) | how to check the build end to end |
| [`powerbi/BUILD_GUIDE.md`](powerbi/BUILD_GUIDE.md) | assembling the Power BI report |
