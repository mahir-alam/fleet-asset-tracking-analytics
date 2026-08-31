# Fleet Asset Tracking & Predictive Analytics

Full-stack platform for mine-site heavy-equipment fleets: a real-time React/Node
operational dashboard, a Python analytics + Excel pipeline, a Power BI reporting
layer, PowerShell scheduled automation, and a **real HTTP integration** that
auto-creates tickets in a separate
[IT Help Desk Ticketing system](https://github.com/mahir-alam/it-helpdesk-ticketing-system)
when a maintenance threshold is breached.

## What it does

- Tracks **utilization**, **fuel consumption** (L / $ per engine-hour),
  **unplanned downtime**, **MTBF / MTTR / availability**, and **service-interval
  status** across the fleet.
- A **threshold engine** (`server/src/modules/alerts/rules.js`) raises
  `MaintenanceFlag`s; ticketable kinds (`SERVICE_OVERDUE`, `EXCESSIVE_DOWNTIME`,
  `HIGH_FUEL_BURN`) fire `POST /api/tickets/auto-create` against the ticketing
  system and record an auditable `IntegrationEvent`.
- **Excel both ways**: raw fleet workbook → Python ingest → Postgres; and a
  formatted stakeholder summary exported back to `.xlsx`.
- **Power BI** semantic model (TMDL) over the same SQL views for BI-style
  exploration — a distinct layer from the operational dashboard.
- **PowerShell** (`automation/`) runs the pipeline on Windows Task Scheduler;
  GitHub Actions does the same in the cloud.

## Stack

React · Node · Express · Prisma · PostgreSQL · Python (openpyxl / SQLAlchemy) ·
Excel · Power BI · PowerShell · `node:test` · Vercel + Render

## Quick start

```bash
cp .env.example .env
npm install
pip install -e ./analytics

docker compose up -d db
npm --workspace server run prisma:migrate
npm --workspace server run db:views
python data/generate_sample_data.py
npm --workspace server run seed

npm run dev            # API http://localhost:4000  ·  dashboard http://localhost:5173
```

Then, in the dashboard: **Refresh evaluation** (raises 5 flags, creates 3
tickets) and **Send test alert** (fires one on demand). See the results on the
**Alerts & Tickets** page.

```bash
# Excel pipeline
python -m fleet_analytics ingest --file data/raw/fleet_raw_sample.xlsx
python -m fleet_analytics report        # -> data/exports/fleet-summary-<date>.xlsx

# scheduled pipeline, once
pwsh automation/Invoke-FleetPipeline.ps1 -ApiBase http://localhost:4000

# tests
npm --workspace server test
cd analytics && python -m pytest -q
```

## Docs

| File | |
| --- | --- |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | layers, data flow, alert engine |
| [`docs/INTEGRATION.md`](docs/INTEGRATION.md) | the ticketing contract (verified against source) |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | Vercel + Render |
| [`docs/VERIFICATION.md`](docs/VERIFICATION.md) | how to prove the build end-to-end |
| [`powerbi/BUILD_GUIDE.md`](powerbi/BUILD_GUIDE.md) | assembling the Power BI report |
