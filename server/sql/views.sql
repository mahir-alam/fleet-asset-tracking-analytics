-- ─────────────────────────────────────────────────────────────────────────────
-- Analytics views for Fleet Asset Tracking & Predictive Analytics.
--
-- These are the single source of truth for the operational metrics consumed by
--   * the Express API  (server/src/modules/analytics)
--   * the Power BI semantic model  (powerbi/FleetAnalytics.SemanticModel)
--
-- All rolling windows are the trailing 30 days from CURRENT_DATE (720 hours).
-- Numeric results are cast to float8 so the JS/Prisma layer receives plain
-- numbers rather than strings, and counts are cast to int to avoid BigInt.
--
-- Apply with:  npm --workspace server run db:views   (idempotent)
-- ─────────────────────────────────────────────────────────────────────────────

-- One non-RESOLVED maintenance flag per (asset, kind). Backs the app-level
-- dedupe in alerts.service.js.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_flag_asset_kind_active"
  ON "MaintenanceFlag" ("assetId", "kind")
  WHERE "status" <> 'RESOLVED';

-- ── Daily utilization ───────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_asset_utilization_daily AS
SELECT
  u."assetId",
  u."date",
  u."engineHours",
  u."idleHours",
  a."scheduledHoursPerDay",
  CASE WHEN a."scheduledHoursPerDay" > 0
       THEN (ROUND((u."engineHours" / a."scheduledHoursPerDay" * 100)::numeric, 1))::float8
       ELSE 0 END AS utilization_pct
FROM "UtilizationLog" u
JOIN "Asset" a ON a."id" = u."assetId";

-- ── 30-day utilization rollup per asset ─────────────────────────────────────
CREATE OR REPLACE VIEW v_asset_utilization_rollup AS
SELECT
  a."id"        AS "assetId",
  a."assetTag",
  a."name",
  a."type"::text AS "type",
  COUNT(u."id")::int                                        AS days_logged,
  COALESCE((ROUND(SUM(u."engineHours")::numeric, 1))::float8, 0)  AS total_engine_hours_30d,
  COALESCE((ROUND(AVG(u."engineHours")::numeric, 2))::float8, 0)  AS avg_engine_hours_per_day,
  COALESCE((ROUND((AVG(u."engineHours" / NULLIF(a."scheduledHoursPerDay", 0)) * 100)::numeric, 1))::float8, 0)
                                                           AS avg_utilization_pct_30d
FROM "Asset" a
LEFT JOIN "UtilizationLog" u
  ON u."assetId" = a."id"
 AND u."date" >= (CURRENT_DATE - INTERVAL '30 days')
GROUP BY a."id", a."assetTag", a."name", a."type";

-- ── Fuel efficiency per asset (30 days) ────────────────────────────────────
CREATE OR REPLACE VIEW v_fuel_efficiency AS
WITH fuel AS (
  SELECT "assetId", SUM("litres") AS litres_30d, SUM("cost") AS fuel_cost_30d
  FROM "FuelLog"
  WHERE "date" >= (CURRENT_DATE - INTERVAL '30 days')
  GROUP BY "assetId"
),
eng AS (
  SELECT "assetId", SUM("engineHours") AS engine_hours_30d
  FROM "UtilizationLog"
  WHERE "date" >= (CURRENT_DATE - INTERVAL '30 days')
  GROUP BY "assetId"
)
SELECT
  a."id"         AS "assetId",
  a."assetTag",
  a."type"::text AS "type",
  COALESCE((ROUND(f.litres_30d::numeric, 1))::float8, 0)      AS litres_30d,
  COALESCE((ROUND(f.fuel_cost_30d::numeric, 2))::float8, 0)   AS fuel_cost_30d,
  COALESCE((ROUND(e.engine_hours_30d::numeric, 1))::float8, 0) AS engine_hours_30d,
  CASE WHEN COALESCE(e.engine_hours_30d, 0) > 0
       THEN (ROUND((f.litres_30d / e.engine_hours_30d)::numeric, 2))::float8 END AS litres_per_engine_hour,
  CASE WHEN COALESCE(e.engine_hours_30d, 0) > 0
       THEN (ROUND((f.fuel_cost_30d / e.engine_hours_30d)::numeric, 2))::float8 END AS cost_per_engine_hour
FROM "Asset" a
LEFT JOIN fuel f ON f."assetId" = a."id"
LEFT JOIN eng  e ON e."assetId" = a."id";

-- ── Downtime / reliability per asset (30 days) ─────────────────────────────
CREATE OR REPLACE VIEW v_downtime_summary AS
WITH dt AS (
  SELECT
    "assetId",
    COUNT(*) FILTER (WHERE "category" = 'UNPLANNED')               AS unplanned_events_30d,
    COALESCE(SUM("hours") FILTER (WHERE "category" = 'UNPLANNED'), 0) AS unplanned_hours_30d,
    COALESCE(SUM("hours"), 0)                                       AS total_downtime_hours_30d,
    AVG("hours") FILTER (WHERE "category" = 'UNPLANNED')           AS mttr_hours
  FROM "DowntimeEvent"
  WHERE "startAt" >= (CURRENT_DATE - INTERVAL '30 days')
  GROUP BY "assetId"
)
SELECT
  a."id"         AS "assetId",
  a."assetTag",
  a."type"::text AS "type",
  COALESCE(dt.unplanned_events_30d, 0)::int                             AS unplanned_events_30d,
  COALESCE((ROUND(dt.unplanned_hours_30d::numeric, 1))::float8, 0)      AS unplanned_downtime_hours_30d,
  COALESCE((ROUND(dt.total_downtime_hours_30d::numeric, 1))::float8, 0) AS total_downtime_hours_30d,
  (ROUND(COALESCE(dt.mttr_hours, 0)::numeric, 1))::float8              AS mttr_hours,
  CASE WHEN COALESCE(dt.unplanned_events_30d, 0) > 0
       THEN (ROUND((720.0 / dt.unplanned_events_30d)::numeric, 1))::float8
       ELSE NULL END                                                  AS mtbf_hours,
  (ROUND((GREATEST(720.0 - COALESCE(dt.total_downtime_hours_30d, 0), 0) / 720.0 * 100)::numeric, 1))::float8
                                                                      AS availability_pct_30d
FROM "Asset" a
LEFT JOIN dt ON dt."assetId" = a."id";

-- ── Maintenance / service status per asset ─────────────────────────────────
CREATE OR REPLACE VIEW v_maintenance_status AS
SELECT
  a."id"         AS "assetId",
  a."assetTag",
  a."type"::text AS "type",
  a."serviceIntervalHours",
  a."lastServiceHours",
  a."currentEngineHours",
  (ROUND((a."currentEngineHours" - a."lastServiceHours")::numeric, 1))::float8 AS hours_since_service,
  (ROUND((a."lastServiceHours" + a."serviceIntervalHours" - a."currentEngineHours")::numeric, 1))::float8 AS hours_to_next_service,
  ((a."currentEngineHours" - a."lastServiceHours") > a."serviceIntervalHours") AS service_overdue
FROM "Asset" a;

-- ── Fleet-wide single-row KPI rollup ──────────────────────────────────────
CREATE OR REPLACE VIEW v_fleet_kpis AS
SELECT
  (SELECT COUNT(*)::int FROM "Asset" WHERE "status" <> 'RETIRED')                                  AS active_assets,
  (SELECT (ROUND(AVG(avg_utilization_pct_30d)::numeric, 1))::float8 FROM v_asset_utilization_rollup) AS avg_utilization_pct,
  (SELECT (ROUND(AVG(availability_pct_30d)::numeric, 1))::float8 FROM v_downtime_summary)           AS avg_availability_pct,
  (SELECT (ROUND(AVG(cost_per_engine_hour)::numeric, 2))::float8 FROM v_fuel_efficiency
     WHERE cost_per_engine_hour IS NOT NULL)                                                       AS avg_fuel_cost_per_engine_hour,
  (SELECT (ROUND(SUM(unplanned_downtime_hours_30d)::numeric, 1))::float8 FROM v_downtime_summary)  AS total_unplanned_downtime_hours,
  (SELECT COUNT(*)::int FROM v_maintenance_status WHERE service_overdue)                           AS assets_overdue_service,
  (SELECT COUNT(*)::int FROM "MaintenanceFlag" WHERE "status" = 'OPEN')                            AS open_flags,
  (SELECT COUNT(*)::int FROM "MaintenanceFlag" WHERE "status" = 'TICKETED')                        AS ticketed_flags,
  (SELECT COUNT(*)::int FROM "IntegrationEvent" WHERE "ok" = true)                                 AS tickets_auto_raised;
