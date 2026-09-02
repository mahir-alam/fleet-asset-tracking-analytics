# Architecture

## Two layers, on purpose

| Layer                         | Tech                     | Audience / job                                             |
| ----------------------------- | ------------------------ | -------------------------------------------------------- |
| **Operational** (this app)    | React + Express + Postgres | real-time fleet monitoring, alerting, the ticketing trigger |
| **Analytical / BI**           | Power BI                  | historical trends, drill-through, executive reporting     |

Both read the **same SQL views** (`server/sql/views.sql`), so they never
disagree on a number. Python is the data-analysis and pipeline engine.

## Data flow

```
                 ┌───────────────────────┐
 raw .xlsx  ───▶ │ Python: fleet_analytics│──ingest──▶  ┌──────────────┐
 (fleet ops)     │  ingest / metrics /    │             │  PostgreSQL  │
                 │  report                │◀──report────│  + SQL views │
                 └───────────────────────┘  .xlsx out   └──────┬───────┘
                                                               │
 PowerShell (Task Scheduler) / GitHub Actions                  │
   └─ ingest ─ report ─ POST /api/alerts/evaluate ─────────────┤
                                                               │
                            ┌──────────────────────────────────┴───────┐
                            │ Express API (server/src)                  │
                            │  assets · telemetry · analytics           │
                            │  alerts (rules.js → thresholds.json)      │
                            │  integration (ticketClient.js)            │
                            └───────┬───────────────────────┬──────────┘
                                    │                       │
                        React dashboard (client/)   POST /api/tickets/auto-create
                        Dashboard · AssetDetail             │  (X-Api-Key)
                        Alerts · Analytics                  ▼
                                                   IT Help Desk Ticketing system
                                                   (SYSTEM_GENERATED ticket)
```

## Alert engine

`server/src/modules/alerts/rules.js` is the only place that decides what counts
as a maintenance condition. It is pure and synchronous. `thresholds.json` holds
the numbers (env-overridable). Python only reports metrics; it never re-evaluates
alert rules, so the two can't drift.

`alerts.service.js#runFleetEvaluation()`:

1. load non-retired assets + the merged metrics row per asset (from the views)
2. `evaluateAsset()` → findings
3. for each finding with no existing non-`RESOLVED` flag for `(asset, kind)` →
   create a `MaintenanceFlag` (a partial unique index enforces the dedupe)
4. if the kind is ticketable → `ticketClient.createTicketFromFlag()` →
   persist an `IntegrationEvent` → on success flip the flag to `TICKETED`

Entry points: the `EVALUATION_CRON` job, `POST /api/alerts/evaluate` (PowerShell
pipeline + dashboard "Refresh evaluation"), and `POST /api/integration/test-alert`
(the "Send test alert" button — synthetic, non-persisted flag).

## Data model

`Asset` 1—* `UtilizationLog` / `FuelLog` / `DowntimeEvent` / `MaintenanceFlag`;
`MaintenanceFlag` 1—* `IntegrationEvent`. See `server/prisma/schema.prisma`.

## Repo layout

```
server/     Express API + Prisma + SQL views + Jest-free node:test suite
client/     React (Vite) dashboard
analytics/  Python package: Excel ingest, metric calcs, Excel report, CLI
automation/ PowerShell pipeline + Scheduled Task registration
powerbi/    PBIP semantic model (TMDL) + DAX + build/report specs
data/       deterministic sample-data generator, raw .xlsx, exports/
docs/       this folder
```
