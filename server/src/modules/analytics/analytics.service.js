import { prisma } from '../../lib/prisma.js';

/**
 * Read model for the analytics layer. Every query here reads the SQL views in
 * server/sql/views.sql, which are also the source for the Power BI model, so the
 * two report the same numbers.
 */

const ASSET_METRICS_SQL = `
  SELECT
    a."id"    AS "assetId",
    a."assetTag",
    a."name",
    a."type"::text  AS "type",
    a."site",
    a."status"::text AS "status",
    a."serviceIntervalHours",
    ur.days_logged,
    ur.total_engine_hours_30d,
    ur.avg_engine_hours_per_day,
    ur.avg_utilization_pct_30d,
    fe.litres_30d,
    fe.fuel_cost_30d,
    fe.litres_per_engine_hour,
    fe.cost_per_engine_hour,
    ds.unplanned_events_30d,
    ds.unplanned_downtime_hours_30d,
    ds.total_downtime_hours_30d,
    ds.mtbf_hours,
    ds.mttr_hours,
    ds.availability_pct_30d,
    ms.hours_since_service,
    ms.hours_to_next_service,
    ms.service_overdue
  FROM "Asset" a
  LEFT JOIN v_asset_utilization_rollup ur ON ur."assetId" = a."id"
  LEFT JOIN v_fuel_efficiency          fe ON fe."assetId" = a."id"
  LEFT JOIN v_downtime_summary         ds ON ds."assetId" = a."id"
  LEFT JOIN v_maintenance_status       ms ON ms."assetId" = a."id"
`;

export async function fleetKpis() {
  const rows = await prisma.$queryRawUnsafe('SELECT * FROM v_fleet_kpis');
  return rows[0] ?? {};
}

export async function assetMetrics() {
  return prisma.$queryRawUnsafe(`${ASSET_METRICS_SQL} ORDER BY a."assetTag"`);
}

export async function assetMetricsById(assetId) {
  const rows = await prisma.$queryRawUnsafe(`${ASSET_METRICS_SQL} WHERE a."id" = $1`, assetId);
  return rows[0] ?? null;
}

export async function utilizationDaily(assetId, days = 90) {
  return prisma.$queryRawUnsafe(
    `SELECT "date", "engineHours", "idleHours", utilization_pct
       FROM v_asset_utilization_daily
      WHERE "assetId" = $1 AND "date" >= (CURRENT_DATE - ($2 || ' days')::interval)
      ORDER BY "date"`,
    assetId,
    String(days),
  );
}
