"""
Generate a deterministic sample fleet dataset for
Fleet Asset Tracking & Predictive Analytics.

Outputs (run from the repo root):
  data/raw/fleet_raw_sample.xlsx     multi-sheet raw dataset -> Python/Excel ingest demo
  server/prisma/seed-data.json       normalized seed for `prisma db seed`

A handful of assets are deliberately built to breach alert thresholds so the
demo produces MaintenanceFlags and auto-creates IT tickets:

  HT-13  SERVICE_OVERDUE     (ticketed)
  EX-03  EXCESSIVE_DOWNTIME  (ticketed)
  WT-01  HIGH_FUEL_BURN      (ticketed)
  DZ-02  LOW_UTILIZATION     (flag only)
  GR-01  SERVICE_DUE         (flag only)

Requires: openpyxl  (pip install -r analytics/requirements.txt)
"""

from __future__ import annotations

import json
import random
from datetime import date, datetime, timedelta
from pathlib import Path

from openpyxl import Workbook

SEED = 42
DAYS = 90
FUEL_PRICE_PER_L = 1.55
SERVICE_INTERVAL = 500.0
SCHEDULED_HOURS_PER_DAY = 20.0

REPO_ROOT = Path(__file__).resolve().parents[1]
RAW_XLSX = REPO_ROOT / "data" / "raw" / "fleet_raw_sample.xlsx"
SEED_JSON = REPO_ROOT / "server" / "prisma" / "seed-data.json"

SITES = ["North Pit", "South Pit", "Main ROM Pad", "Waste Dump 3"]

TYPE_MODELS = {
    "HAUL_TRUCK": "CAT 793F",
    "EXCAVATOR": "CAT 6020B",
    "DOZER": "CAT D10T2",
    "LOADER": "CAT 992K",
    "GRADER": "CAT 24M",
    "WATER_TRUCK": "CAT 777 WT",
}

# Nominal fuel burn (L per engine-hour) per equipment type.
FUEL_BASELINE = {
    "HAUL_TRUCK": 45.0,
    "EXCAVATOR": 30.0,
    "DOZER": 35.0,
    "LOADER": 25.0,
    "GRADER": 20.0,
    "WATER_TRUCK": 22.0,
}

FLEET = (
    [(f"HT-{n:02d}", "HAUL_TRUCK") for n in range(11, 19)]   # 8
    + [(f"EX-{n:02d}", "EXCAVATOR") for n in range(1, 5)]    # 4
    + [(f"DZ-{n:02d}", "DOZER") for n in range(1, 4)]        # 3
    + [(f"LD-{n:02d}", "LOADER") for n in range(1, 3)]       # 2
    + [(f"GR-{n:02d}", "GRADER") for n in range(1, 3)]       # 2
    + [("WT-01", "WATER_TRUCK")]                             # 1
)

# scenario -> asset tag
SCENARIOS = {
    "HT-13": "service_overdue",
    "EX-03": "excessive_downtime",
    "WT-01": "high_fuel_burn",
    "DZ-02": "low_utilization",
    "GR-01": "service_due",
}


def daterange(end: date, days: int):
    start = end - timedelta(days=days - 1)
    for i in range(days):
        yield start + timedelta(days=i)


def build():
    rng = random.Random(SEED)
    end_day = date.today() - timedelta(days=1)

    assets, utilization, fuel, downtime = [], [], [], []

    for idx, (tag, atype) in enumerate(FLEET):
        scenario = SCENARIOS.get(tag)
        starting_hours = round(rng.uniform(3000, 17000), 1)
        commissioned = end_day - timedelta(days=int(rng.uniform(400, 2600)))

        # --- daily utilization target as a fraction of scheduled hours ---
        if scenario == "low_utilization":
            util_frac_mean = 0.33
        else:
            util_frac_mean = rng.uniform(0.62, 0.82)

        burn_rate = FUEL_BASELINE[atype] * (
            1.42 if scenario == "high_fuel_burn" else rng.uniform(0.9, 1.12)
        )

        cum_engine = starting_hours
        litres_since_fill = 0.0
        eng_hours_since_fill_start = cum_engine
        days_to_next_fill = rng.randint(1, 2)

        for d in daterange(end_day, DAYS):
            frac = min(max(rng.gauss(util_frac_mean, 0.08), 0.0), 1.0)
            engine_hours = round(frac * SCHEDULED_HOURS_PER_DAY, 2)
            idle_hours = round(min(rng.uniform(0.5, 3.5), SCHEDULED_HOURS_PER_DAY - engine_hours), 2)
            distance_km = round(engine_hours * rng.uniform(6, 12), 1) if atype == "HAUL_TRUCK" else 0.0
            payload = (
                round(engine_hours * rng.uniform(180, 240), 1) if atype == "HAUL_TRUCK" else None
            )
            utilization.append(
                dict(
                    assetTag=tag,
                    date=d.isoformat(),
                    engineHours=engine_hours,
                    idleHours=max(idle_hours, 0.0),
                    distanceKm=distance_km,
                    payloadTonnes=payload,
                )
            )

            cum_engine = round(cum_engine + engine_hours, 2)
            litres_since_fill += engine_hours * burn_rate * rng.uniform(0.95, 1.05)
            days_to_next_fill -= 1
            if days_to_next_fill <= 0:
                litres = round(litres_since_fill, 1)
                fuel.append(
                    dict(
                        assetTag=tag,
                        date=d.isoformat(),
                        litres=litres,
                        cost=round(litres * FUEL_PRICE_PER_L, 2),
                        engineHoursAtFill=cum_engine,
                    )
                )
                litres_since_fill = 0.0
                eng_hours_since_fill_start = cum_engine
                days_to_next_fill = rng.randint(1, 2)

        # --- downtime events ---
        if scenario == "excessive_downtime":
            n_unplanned, dur_lo, dur_hi = 15, 3.0, 7.5   # ~75 h in the last 30 days
            recent_only = True
        else:
            n_unplanned, dur_lo, dur_hi = rng.randint(1, 4), 0.75, 4.0
            recent_only = False

        for _ in range(n_unplanned):
            offset = rng.randint(0, 29) if recent_only else rng.randint(0, DAYS - 1)
            start_dt = datetime.combine(end_day - timedelta(days=offset), datetime.min.time()) + timedelta(
                hours=rng.uniform(0, 18)
            )
            dur = round(rng.uniform(dur_lo, dur_hi), 1)
            downtime.append(
                dict(
                    assetTag=tag,
                    startAt=start_dt.isoformat(),
                    endAt=(start_dt + timedelta(hours=dur)).isoformat(),
                    category="UNPLANNED",
                    reason=rng.choice(
                        [
                            "Hydraulic hose failure",
                            "Engine fault code",
                            "Tyre change",
                            "Electrical fault",
                            "Brake system fault",
                            "Cooling system leak",
                        ]
                    ),
                    hours=dur,
                )
            )

        for _ in range(rng.randint(1, 2)):
            offset = rng.randint(0, DAYS - 1)
            start_dt = datetime.combine(end_day - timedelta(days=offset), datetime.min.time()) + timedelta(
                hours=rng.uniform(0, 12)
            )
            dur = round(rng.uniform(4.0, 10.0), 1)
            downtime.append(
                dict(
                    assetTag=tag,
                    startAt=start_dt.isoformat(),
                    endAt=(start_dt + timedelta(hours=dur)).isoformat(),
                    category="PLANNED",
                    reason="Scheduled preventive maintenance",
                    hours=dur,
                )
            )

        # --- service history (drives v_maintenance_status) ---
        if scenario == "service_overdue":
            hours_since_service = SERVICE_INTERVAL * 1.15
        elif scenario == "service_due":
            hours_since_service = SERVICE_INTERVAL - 30.0
        else:
            hours_since_service = SERVICE_INTERVAL * rng.uniform(0.2, 0.85)
        last_service_hours = round(cum_engine - hours_since_service, 1)

        assets.append(
            dict(
                assetTag=tag,
                name=f"{atype.replace('_', ' ').title()} {tag}",
                type=atype,
                site=SITES[idx % len(SITES)],
                model=TYPE_MODELS[atype],
                commissionedAt=datetime.combine(commissioned, datetime.min.time()).isoformat(),
                scheduledHoursPerDay=SCHEDULED_HOURS_PER_DAY,
                serviceIntervalHours=SERVICE_INTERVAL,
                lastServiceHours=last_service_hours,
                currentEngineHours=round(cum_engine, 1),
                status="ACTIVE",
            )
        )

    return dict(
        generatedAt=datetime.now().isoformat(timespec="seconds"),
        windowDays=DAYS,
        assets=assets,
        utilizationLogs=utilization,
        fuelLogs=fuel,
        downtimeEvents=downtime,
    )


def write_xlsx(data: dict, path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    wb = Workbook()
    wb.remove(wb.active)

    sheets = {
        "Assets": (
            ["assetTag", "name", "type", "site", "model", "commissionedAt",
             "scheduledHoursPerDay", "serviceIntervalHours", "lastServiceHours",
             "currentEngineHours", "status"],
            data["assets"],
        ),
        "UtilizationLogs": (
            ["assetTag", "date", "engineHours", "idleHours", "distanceKm", "payloadTonnes"],
            data["utilizationLogs"],
        ),
        "FuelLogs": (
            ["assetTag", "date", "litres", "cost", "engineHoursAtFill"],
            data["fuelLogs"],
        ),
        "DowntimeEvents": (
            ["assetTag", "startAt", "endAt", "category", "reason", "hours"],
            data["downtimeEvents"],
        ),
    }

    for name, (cols, rows) in sheets.items():
        ws = wb.create_sheet(name)
        ws.append(cols)
        for r in rows:
            ws.append([r.get(c) for c in cols])
        ws.freeze_panes = "A2"

    wb.save(path)


def main():
    data = build()
    write_xlsx(data, RAW_XLSX)
    SEED_JSON.parent.mkdir(parents=True, exist_ok=True)
    SEED_JSON.write_text(json.dumps(data, indent=2), encoding="utf8")

    print(f"assets:          {len(data['assets'])}")
    print(f"utilizationLogs: {len(data['utilizationLogs'])}")
    print(f"fuelLogs:        {len(data['fuelLogs'])}")
    print(f"downtimeEvents:  {len(data['downtimeEvents'])}")
    print(f"-> {RAW_XLSX.relative_to(REPO_ROOT)}")
    print(f"-> {SEED_JSON.relative_to(REPO_ROOT)}")


if __name__ == "__main__":
    main()
