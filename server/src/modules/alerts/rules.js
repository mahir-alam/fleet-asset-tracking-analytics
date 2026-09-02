import { readFileSync } from 'node:fs';

/**
 * Threshold rules: given an asset and its 30-day metrics, return the list of
 * maintenance conditions it currently breaches. No I/O, so it unit-tests directly.
 *
 * `metrics` is a row from analytics.service.assetMetrics() (snake_case fields
 * from the SQL views). `asset` is a Prisma Asset record.
 */

export const DEFAULT_THRESHOLDS = JSON.parse(
  readFileSync(new URL('./thresholds.json', import.meta.url), 'utf8'),
);

// Optional env overrides for the numeric thresholds (demo and deployment tuning).
function withEnvOverrides(t) {
  const n = (v, d) => (v === undefined || v === '' ? d : Number(v));
  return {
    ...t,
    lowUtilizationPct: n(process.env.THRESHOLD_LOW_UTIL_PCT, t.lowUtilizationPct),
    excessiveUnplannedDowntimeHours: n(
      process.env.THRESHOLD_DOWNTIME_HOURS,
      t.excessiveUnplannedDowntimeHours,
    ),
    minAvailabilityPct: n(process.env.THRESHOLD_MIN_AVAILABILITY_PCT, t.minAvailabilityPct),
    serviceDueWindowHours: n(process.env.THRESHOLD_SERVICE_DUE_WINDOW, t.serviceDueWindowHours),
    fuelBurnMultiplier: n(process.env.THRESHOLD_FUEL_MULTIPLIER, t.fuelBurnMultiplier),
  };
}

/** Kinds that are escalated to the IT ticketing system when newly raised. */
export const TICKETABLE_KINDS = ['SERVICE_OVERDUE', 'EXCESSIVE_DOWNTIME', 'HIGH_FUEL_BURN'];

const round = (v) => Math.round(v * 10) / 10;

/**
 * @returns {Array<{kind,detail,thresholdValue,observedValue}>}
 */
export function evaluateAsset(asset, metrics = {}, thresholds = DEFAULT_THRESHOLDS) {
  const t = withEnvOverrides(thresholds);
  const findings = [];

  // Service interval
  const hoursSince = num(metrics.hours_since_service);
  const hoursToNext = num(metrics.hours_to_next_service);
  if (hoursSince != null && hoursSince > asset.serviceIntervalHours) {
    findings.push({
      kind: 'SERVICE_OVERDUE',
      detail: `${round(hoursSince)} engine-hours since last service; interval is ${asset.serviceIntervalHours} h (over by ${round(hoursSince - asset.serviceIntervalHours)} h).`,
      thresholdValue: asset.serviceIntervalHours,
      observedValue: round(hoursSince),
    });
  } else if (
    hoursToNext != null &&
    hoursToNext > 0 &&
    hoursToNext <= t.serviceDueWindowHours
  ) {
    findings.push({
      kind: 'SERVICE_DUE',
      detail: `Service due in ${round(hoursToNext)} engine-hours (window ${t.serviceDueWindowHours} h).`,
      thresholdValue: t.serviceDueWindowHours,
      observedValue: round(hoursToNext),
    });
  }

  // Utilization
  const util = num(metrics.avg_utilization_pct_30d);
  const daysLogged = num(metrics.days_logged) ?? 0;
  if (
    util != null &&
    daysLogged >= t.minDaysLoggedForUtilization &&
    util < t.lowUtilizationPct
  ) {
    findings.push({
      kind: 'LOW_UTILIZATION',
      detail: `30-day average utilization ${util}% is below the ${t.lowUtilizationPct}% floor (${daysLogged} days logged).`,
      thresholdValue: t.lowUtilizationPct,
      observedValue: util,
    });
  }

  // Downtime / availability
  const downHours = num(metrics.unplanned_downtime_hours_30d) ?? 0;
  const availability = num(metrics.availability_pct_30d);
  const downtimeBreached = downHours > t.excessiveUnplannedDowntimeHours;
  const availabilityBreached = availability != null && availability < t.minAvailabilityPct;
  if (downtimeBreached || availabilityBreached) {
    findings.push({
      kind: 'EXCESSIVE_DOWNTIME',
      detail:
        `Unplanned downtime ${round(downHours)} h / 30 days` +
        (availability != null ? `, availability ${availability}%` : '') +
        `. Limits: ${t.excessiveUnplannedDowntimeHours} h / ${t.minAvailabilityPct}%.`,
      thresholdValue: t.excessiveUnplannedDowntimeHours,
      observedValue: round(downHours),
    });
  }

  // Fuel burn
  const burn = num(metrics.litres_per_engine_hour);
  const baseline = thresholds.fuelBurnBaselineLitresPerHour?.[asset.type];
  if (burn != null && baseline) {
    const limit = round(baseline * t.fuelBurnMultiplier);
    if (burn > limit) {
      findings.push({
        kind: 'HIGH_FUEL_BURN',
        detail: `Fuel burn ${burn} L/engine-hour exceeds ${limit} L/h (${baseline} L/h baseline for ${asset.type} x ${t.fuelBurnMultiplier}).`,
        thresholdValue: limit,
        observedValue: burn,
      });
    }
  }

  return findings;
}

function num(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
