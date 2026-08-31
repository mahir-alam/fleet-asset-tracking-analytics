# Power BI data source

The report is an **analytical / BI layer** that is deliberately separate from the
operational React dashboard. Both read the **same SQL views** (`server/sql/views.sql`),
so the two layers agree by construction.

## Option A — direct PostgreSQL connection (recommended)

The semantic model is parameterised with two M parameters:

| Parameter  | Local dev value | Deployed value (example)          |
| ---------- | --------------- | -------------------------------- |
| `DbServer` | `localhost:5433` | `your-db-host.render.com:5432`  |
| `DbName`   | `fleet`          | `fleet`                         |

In Power BI Desktop: **Transform data → Manage parameters**, set the two values,
then **Close & Apply**. Get Data → PostgreSQL database also works for a manual build.

Tables to load (all from schema `public`):

| Table / view                 | Role                                        |
| ---------------------------- | ------------------------------------------- |
| `Asset`                      | dimension (tag, type, site, model, status)  |
| `v_asset_utilization_rollup` | 30-day utilization per asset                |
| `v_fuel_efficiency`          | 30-day L/eng-hr and $/eng-hr per asset      |
| `v_downtime_summary`         | unplanned downtime, MTBF, MTTR, availability |
| `v_maintenance_status`       | hours since/to service, overdue flag        |
| `v_fleet_kpis`               | single-row fleet rollup                     |
| `MaintenanceFlag`            | raised flags + linked IT ticket numbers     |

## Option B — the Excel export

If a direct DB connection is not available (e.g. reviewing offline), point Power BI
at the workbook produced by the pipeline:

```
data/exports/fleet-summary-<date>.xlsx
```

Its sheets map 1:1 to the views above. Regenerate it with
`python -m fleet_analytics report`.

## Relationships

```
Asset[assetTag]  1 ─── *  v_asset_utilization_rollup[assetTag]
Asset[assetTag]  1 ─── *  v_fuel_efficiency[assetTag]
Asset[assetTag]  1 ─── *  v_downtime_summary[assetTag]
Asset[assetTag]  1 ─── *  v_maintenance_status[assetTag]
Asset[id]        1 ─── *  MaintenanceFlag[assetId]
DateTable[Date]  1 ─── *  MaintenanceFlag[FlagDate]   (calculated column)
```

`v_fleet_kpis` is a standalone one-row table (no relationship).
