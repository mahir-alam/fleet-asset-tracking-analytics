# Power BI build guide

This folder is a **Power BI Project (PBIP)**: the semantic model (tables,
relationships, DAX measures) is version-controlled as TMDL text under
`FleetAnalytics.SemanticModel/`. The report *visual layout* is assembled once in
Power BI Desktop from `REPORT_SPEC.md` — a `.pbix` canvas cannot be hand-authored
outside the tool.

## 1. Prerequisites

- **Power BI Desktop**, November 2024 or later.
- Enable **File → Options → Preview features → "Store semantic model using TMDL format"**
  and **"Power BI Project (.pbip) save option"**, then restart.
- The Fleet Postgres DB reachable (local: `docker compose up -d db`, then apply
  the views with `npm --workspace server run db:views` and seed).

## 2. Open the project

Open `powerbi/fleet-analytics.pbip` in Power BI Desktop.

- **Manage parameters** (Transform data ▸ Manage parameters): set `DbServer`
  (`localhost:5433` for local dev) and `DbName` (`fleet`).
- **Refresh**. All eight tables should load and every measure in `measures.dax`
  should resolve. Check **Model view** for the six relationships in
  `DATA_SOURCE.md`.

> If your Desktop build cannot open the folder format, use the **manual path**:
> New report → **Get data ▸ PostgreSQL** → load the tables listed in
> `DATA_SOURCE.md` → create the relationships → add a table named `Measures` and
> paste every measure from `measures.dax`. The result is identical.

## 3. Build the three report pages

Follow `REPORT_SPEC.md`. Pages are pre-created (`Fleet Overview`,
`Downtime & Maintenance`, `Fuel & Cost`) but empty — add the visuals listed for
each. Use the dark theme, accent `#3D9DF2`.

## 4. Publish & capture

1. **Publish** to a Power BI Service workspace.
2. Set scheduled refresh (or use a Service gateway) against the same DB.
3. Export each page to PNG into `powerbi/screenshots/` and commit them —
   that is the reviewable evidence the report is real.

## What's in the box

| Path                                             | What it is                                    |
| ------------------------------------------------ | -------------------------------------------- |
| `fleet-analytics.pbip`                            | project entry point                          |
| `FleetAnalytics.SemanticModel/definition/*.tmdl`  | model: 8 tables, 6 relationships, 16 measures |
| `FleetAnalytics.Report/definition/`               | 3 empty report pages                          |
| `measures.dax`                                    | every measure, copy-paste ready              |
| `DATA_SOURCE.md`                                  | connection + relationships                    |
| `REPORT_SPEC.md`                                  | visual-by-visual page spec                    |
| `screenshots/`                                    | published-report PNGs (added after step 4)    |
