"""Fleet metric calculations.

The pure functions take plain lists of dict rows and an `as_of` date, so they
are unit-tested without a database. `load_frames` / `compute_all` wire them to
Postgres for the CLI and the Excel report.

Rolling window mirrors the SQL views: the trailing 30 days before `as_of`
(720 hours).
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from statistics import mean
from typing import Any

from sqlalchemy import text
from sqlalchemy.engine import Engine

WINDOW_DAYS = 30
WINDOW_HOURS = WINDOW_DAYS * 24


def _as_date(v) -> date:
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    return date.fromisoformat(str(v)[:10])


def _as_dt(v) -> datetime:
    if isinstance(v, datetime):
        return v
    if isinstance(v, date):
        return datetime(v.year, v.month, v.day)
    return datetime.fromisoformat(str(v)[:19])


def _r(v, n=1):
    return None if v is None else round(v, n)


# ── per-asset summaries ────────────────────────────────────────────────────

def utilization_summary(util_rows, assets, as_of: date) -> dict[str, dict[str, Any]]:
    cutoff = as_of - timedelta(days=WINDOW_DAYS)
    sched = {a["assetTag"]: float(a["scheduledHoursPerDay"]) for a in assets}
    by_tag: dict[str, list[dict]] = {}
    for row in util_rows:
        if _as_date(row["date"]) >= cutoff:
            by_tag.setdefault(row["assetTag"], []).append(row)

    out = {}
    for tag, sh in sched.items():
        rows = by_tag.get(tag, [])
        if rows:
            daily_pct = [float(r["engineHours"]) / sh * 100 for r in rows] if sh else []
            out[tag] = {
                "days_logged": len(rows),
                "total_engine_hours_30d": _r(sum(float(r["engineHours"]) for r in rows)),
                "avg_engine_hours_per_day": _r(mean(float(r["engineHours"]) for r in rows), 2),
                "avg_utilization_pct_30d": _r(mean(daily_pct)) if daily_pct else None,
            }
        else:
            out[tag] = {
                "days_logged": 0,
                "total_engine_hours_30d": 0.0,
                "avg_engine_hours_per_day": 0.0,
                "avg_utilization_pct_30d": None,
            }
    return out


def fuel_summary(fuel_rows, util_rows, assets, as_of: date) -> dict[str, dict[str, Any]]:
    cutoff = as_of - timedelta(days=WINDOW_DAYS)
    tags = [a["assetTag"] for a in assets]

    litres, cost = {}, {}
    for r in fuel_rows:
        if _as_date(r["date"]) >= cutoff:
            litres[r["assetTag"]] = litres.get(r["assetTag"], 0.0) + float(r["litres"])
            cost[r["assetTag"]] = cost.get(r["assetTag"], 0.0) + float(r.get("cost") or 0.0)

    eng = {}
    for r in util_rows:
        if _as_date(r["date"]) >= cutoff:
            eng[r["assetTag"]] = eng.get(r["assetTag"], 0.0) + float(r["engineHours"])

    out = {}
    for tag in tags:
        e = eng.get(tag, 0.0)
        out[tag] = {
            "litres_30d": _r(litres.get(tag, 0.0)),
            "fuel_cost_30d": _r(cost.get(tag, 0.0), 2),
            "engine_hours_30d": _r(e),
            "litres_per_engine_hour": _r(litres.get(tag, 0.0) / e, 2) if e else None,
            "cost_per_engine_hour": _r(cost.get(tag, 0.0) / e, 2) if e else None,
        }
    return out


def downtime_summary(dt_rows, assets, as_of: date) -> dict[str, dict[str, Any]]:
    cutoff = _as_dt(as_of - timedelta(days=WINDOW_DAYS))
    tags = [a["assetTag"] for a in assets]

    unplanned_hours: dict[str, float] = {}
    unplanned_events: dict[str, int] = {}
    total_hours: dict[str, float] = {}
    for r in dt_rows:
        if _as_dt(r["startAt"]) < cutoff:
            continue
        tag = r["assetTag"]
        hrs = float(r.get("hours") or 0.0)
        total_hours[tag] = total_hours.get(tag, 0.0) + hrs
        if r["category"] == "UNPLANNED":
            unplanned_hours[tag] = unplanned_hours.get(tag, 0.0) + hrs
            unplanned_events[tag] = unplanned_events.get(tag, 0) + 1

    out = {}
    for tag in tags:
        events = unplanned_events.get(tag, 0)
        uh = unplanned_hours.get(tag, 0.0)
        th = total_hours.get(tag, 0.0)
        out[tag] = {
            "unplanned_events_30d": events,
            "unplanned_downtime_hours_30d": _r(uh),
            "total_downtime_hours_30d": _r(th),
            "mtbf_hours": _r(WINDOW_HOURS / events) if events else None,
            "mttr_hours": _r(uh / events) if events else 0.0,
            "availability_pct_30d": _r(max(WINDOW_HOURS - th, 0) / WINDOW_HOURS * 100),
        }
    return out


def maintenance_summary(assets) -> dict[str, dict[str, Any]]:
    out = {}
    for a in assets:
        since = float(a["currentEngineHours"]) - float(a["lastServiceHours"])
        interval = float(a["serviceIntervalHours"])
        out[a["assetTag"]] = {
            "service_interval_hours": interval,
            "hours_since_service": _r(since),
            "hours_to_next_service": _r(interval - since),
            "service_overdue": since > interval,
        }
    return out


def fleet_kpis(util, fuel, downtime, maint) -> dict[str, Any]:
    utils = [v["avg_utilization_pct_30d"] for v in util.values() if v["avg_utilization_pct_30d"] is not None]
    avails = [v["availability_pct_30d"] for v in downtime.values() if v["availability_pct_30d"] is not None]
    cph = [v["cost_per_engine_hour"] for v in fuel.values() if v["cost_per_engine_hour"] is not None]
    return {
        "assets": len(maint),
        "avg_utilization_pct": _r(mean(utils)) if utils else None,
        "avg_availability_pct": _r(mean(avails)) if avails else None,
        "avg_fuel_cost_per_engine_hour": _r(mean(cph), 2) if cph else None,
        "total_unplanned_downtime_hours": _r(sum(v["unplanned_downtime_hours_30d"] or 0 for v in downtime.values())),
        "assets_overdue_service": sum(1 for v in maint.values() if v["service_overdue"]),
    }


# ── DB wiring ──────────────────────────────────────────────────────────────

def load_frames(engine: Engine) -> dict[str, list[dict]]:
    q = {
        "assets": 'SELECT "assetTag","scheduledHoursPerDay","serviceIntervalHours",'
                  '"lastServiceHours","currentEngineHours","type","site" FROM "Asset"',
        "utilization": 'SELECT a."assetTag", u."date", u."engineHours" '
                       'FROM "UtilizationLog" u JOIN "Asset" a ON a."id"=u."assetId"',
        "fuel": 'SELECT a."assetTag", f."date", f."litres", f."cost" '
                'FROM "FuelLog" f JOIN "Asset" a ON a."id"=f."assetId"',
        "downtime": 'SELECT a."assetTag", d."startAt", d."category", d."hours" '
                    'FROM "DowntimeEvent" d JOIN "Asset" a ON a."id"=d."assetId"',
    }
    with engine.connect() as cx:
        return {k: [dict(r._mapping) for r in cx.execute(text(v))] for k, v in q.items()}


def compute_all(frames: dict[str, list[dict]], as_of: date | None = None) -> dict[str, Any]:
    as_of = as_of or date.today()
    assets = frames["assets"]
    util = utilization_summary(frames["utilization"], assets, as_of)
    fuel = fuel_summary(frames["fuel"], frames["utilization"], assets, as_of)
    down = downtime_summary(frames["downtime"], assets, as_of)
    maint = maintenance_summary(assets)
    return {
        "as_of": as_of.isoformat(),
        "utilization": util,
        "fuel": fuel,
        "downtime": down,
        "maintenance": maint,
        "fleet_kpis": fleet_kpis(util, fuel, down, maint),
    }
