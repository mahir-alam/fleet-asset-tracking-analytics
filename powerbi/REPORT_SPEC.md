# Power BI report spec — Fleet Analytics

Three pages. All visuals use the measures in `measures.dax`.

## Page 1 — Fleet Overview

| Visual                | Type              | Fields                                                             |
| --------------------- | ----------------- | ----------------------------------------------------------------- |
| KPI cards (row of 6)   | Card              | `Avg Utilization %`, `Fleet Availability %`, `Fuel Cost per Engine Hr`, `Assets Overdue for Service`, `Open Maintenance Flags`, `Tickets Auto-Raised` |
| Utilization by asset   | Bar (horizontal)  | Axis `Asset[assetTag]`, Value `Avg Utilization %`; data colour rule: red < 45, amber < 60, green ≥ 60 |
| Utilization vs availability | Scatter     | X `Avg Utilization %`, Y `Fleet Availability %`, Legend `Asset[type]`, Details `Asset[assetTag]` |
| Fleet by type          | Donut             | Legend `Asset[type]`, Value `Count of Asset`                       |
| Slicers                | Slicer            | `Asset[site]`, `Asset[type]`                                       |

## Page 2 — Downtime & Maintenance

| Visual                     | Type            | Fields                                                        |
| -------------------------- | --------------- | ----------------------------------------------------------- |
| Unplanned downtime Pareto   | Line + clustered column | Axis `Asset[assetTag]` sorted desc by `Unplanned Downtime Hrs`; column `Unplanned Downtime Hrs`; line = running % of total |
| MTBF / MTTR by asset        | Clustered bar   | Axis `Asset[assetTag]`, Values `MTBF (hrs)`, `MTTR (hrs)`     |
| Service status table        | Table           | `Asset[assetTag]`, `v_maintenance_status[hours_since_service]`, `[hours_to_next_service]`, `[service_overdue]`; conditional format overdue rows red |
| Flags detail                | Table           | `MaintenanceFlag[assetId→assetTag]`, `[kind]`, `[status]`, `[observedValue]`, `[thresholdValue]`, `[externalTicketNumber]`, `[createdAt]` |
| Card                        | Card            | `Assets Overdue for Service`                                  |

## Page 3 — Fuel & Cost

| Visual                    | Type          | Fields                                                       |
| ------------------------- | ------------- | --------------------------------------------------------- |
| L/engine-hr by asset       | Bar           | Axis `Asset[assetTag]`, Value `Litres per Engine Hr`; reference line at fleet average |
| $/engine-hr by type        | Clustered bar | Axis `Asset[type]`, Value `Fuel Cost per Engine Hr`          |
| Fuel $ vs engine hours     | Scatter       | X `v_fuel_efficiency[engine_hours_30d]`, Y `v_fuel_efficiency[fuel_cost_30d]`, size `Litres per Engine Hr`, details `assetTag` |
| Fuel cost 30d              | Card          | `SUM(v_fuel_efficiency[fuel_cost_30d])`                      |

## Formatting

- Theme: dark, accent `#3D9DF2` (matches the web dashboard).
- Every page: title, last-refresh text box (`= "Refreshed " & FORMAT(NOW(), "yyyy-mm-dd HH:mm")`).
- Export each page to PNG into `powerbi/screenshots/` after publishing.
