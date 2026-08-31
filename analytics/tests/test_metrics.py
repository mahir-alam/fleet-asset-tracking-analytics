from datetime import date, datetime, timedelta

import pytest

from fleet_analytics.metrics import (
    compute_all,
    downtime_summary,
    fuel_summary,
    maintenance_summary,
    utilization_summary,
)

AS_OF = date(2026, 6, 30)


def util_rows(tag, values, start=AS_OF - timedelta(days=10)):
    return [
        {"assetTag": tag, "date": start + timedelta(days=i), "engineHours": v}
        for i, v in enumerate(values)
    ]


ASSETS = [
    {"assetTag": "HT-01", "scheduledHoursPerDay": 20, "serviceIntervalHours": 500,
     "lastServiceHours": 1000, "currentEngineHours": 1200, "type": "HAUL_TRUCK", "site": "N"},
    {"assetTag": "DZ-01", "scheduledHoursPerDay": 20, "serviceIntervalHours": 500,
     "lastServiceHours": 100, "currentEngineHours": 700, "type": "DOZER", "site": "S"},
]


def test_utilization_percentage_and_day_count():
    rows = util_rows("HT-01", [10, 12, 14, 16])  # /20 -> 50,60,70,80 -> mean 65
    out = utilization_summary(rows, ASSETS[:1], AS_OF)
    assert out["HT-01"]["days_logged"] == 4
    assert out["HT-01"]["avg_utilization_pct_30d"] == 65.0
    assert out["HT-01"]["total_engine_hours_30d"] == 52.0


def test_utilization_excludes_rows_outside_the_window():
    old = util_rows("HT-01", [20, 20], start=AS_OF - timedelta(days=90))
    new = util_rows("HT-01", [10], start=AS_OF - timedelta(days=2))
    out = utilization_summary(old + new, ASSETS[:1], AS_OF)
    assert out["HT-01"]["days_logged"] == 1
    assert out["HT-01"]["avg_utilization_pct_30d"] == 50.0


def test_fuel_per_engine_hour():
    util = util_rows("HT-01", [10, 10, 10])          # 30 engine hours
    fuel = [{"assetTag": "HT-01", "date": AS_OF - timedelta(days=1), "litres": 600, "cost": 930}]
    out = fuel_summary(fuel, util, ASSETS[:1], AS_OF)
    assert out["HT-01"]["litres_per_engine_hour"] == 20.0
    assert out["HT-01"]["cost_per_engine_hour"] == 31.0


def test_downtime_mtbf_mttr_and_availability():
    rows = [
        {"assetTag": "HT-01", "startAt": datetime(2026, 6, 10, 8), "category": "UNPLANNED", "hours": 4},
        {"assetTag": "HT-01", "startAt": datetime(2026, 6, 20, 8), "category": "UNPLANNED", "hours": 6},
        {"assetTag": "HT-01", "startAt": datetime(2026, 6, 25, 8), "category": "PLANNED", "hours": 10},
    ]
    out = downtime_summary(rows, ASSETS[:1], AS_OF)["HT-01"]
    assert out["unplanned_events_30d"] == 2
    assert out["unplanned_downtime_hours_30d"] == 10.0
    assert out["mtbf_hours"] == 360.0            # 720 / 2
    assert out["mttr_hours"] == 5.0              # (4 + 6) / 2
    assert out["availability_pct_30d"] == round((720 - 20) / 720 * 100, 1)


def test_maintenance_overdue_flag():
    out = maintenance_summary(ASSETS)
    assert out["HT-01"]["service_overdue"] is False       # since=200 < 500
    assert out["HT-01"]["hours_to_next_service"] == 300.0
    assert out["DZ-01"]["service_overdue"] is True        # since=600 > 500
    assert out["DZ-01"]["hours_to_next_service"] == -100.0


def test_compute_all_shape_and_kpis():
    frames = {
        "assets": ASSETS,
        "utilization": util_rows("HT-01", [10] * 5) + util_rows("DZ-01", [5] * 5),
        "fuel": [{"assetTag": "HT-01", "date": AS_OF - timedelta(days=1), "litres": 100, "cost": 155}],
        "downtime": [{"assetTag": "DZ-01", "startAt": datetime(2026, 6, 15), "category": "UNPLANNED", "hours": 3}],
    }
    m = compute_all(frames, as_of=AS_OF)
    assert set(m) == {"as_of", "utilization", "fuel", "downtime", "maintenance", "fleet_kpis"}
    assert m["fleet_kpis"]["assets"] == 2
    assert m["fleet_kpis"]["assets_overdue_service"] == 1
