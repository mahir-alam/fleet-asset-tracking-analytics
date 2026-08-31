import pytest

from fleet_analytics.ingest import ValidationError, validate

GOOD_ASSET = {
    "assetTag": "HT-01", "name": "Haul Truck HT-01", "type": "HAUL_TRUCK", "site": "North",
    "model": "CAT 793F", "commissionedAt": "2024-01-01T00:00:00",
    "scheduledHoursPerDay": 20, "serviceIntervalHours": 500,
    "lastServiceHours": 100, "currentEngineHours": 300, "status": "ACTIVE",
}


def base(**over):
    assets = [dict(GOOD_ASSET)]
    data = {
        "Assets": assets,
        "UtilizationLogs": [{"assetTag": "HT-01", "date": "2026-06-01", "engineHours": 12,
                             "idleHours": 2, "distanceKm": 40, "payloadTonnes": 200}],
        "FuelLogs": [{"assetTag": "HT-01", "date": "2026-06-01", "litres": 500, "cost": 775,
                      "engineHoursAtFill": 300}],
        "DowntimeEvents": [{"assetTag": "HT-01", "startAt": "2026-06-02T08:00:00", "endAt": "",
                            "category": "UNPLANNED", "reason": "hose", "hours": 3}],
    }
    for k, v in over.items():
        data[k] = v
    return data


def test_valid_workbook_passes():
    validate(base())


def test_rejects_unknown_asset_tag_in_logs():
    with pytest.raises(ValidationError) as ei:
        validate(base(UtilizationLogs=[{"assetTag": "GHOST", "date": "2026-06-01",
                                        "engineHours": 5, "idleHours": 0, "distanceKm": 0,
                                        "payloadTonnes": None}]))
    assert any("unknown assetTag" in p for p in ei.value.problems)


def test_rejects_bad_enum_and_out_of_range():
    bad_asset = dict(GOOD_ASSET, type="SPACESHIP", scheduledHoursPerDay=99)
    with pytest.raises(ValidationError) as ei:
        validate(base(Assets=[bad_asset]))
    joined = "\n".join(ei.value.problems)
    assert "bad type" in joined
    assert "scheduledHoursPerDay" in joined


def test_rejects_duplicate_asset_tags():
    with pytest.raises(ValidationError) as ei:
        validate(base(Assets=[dict(GOOD_ASSET), dict(GOOD_ASSET)]))
    assert any("duplicate assetTag" in p for p in ei.value.problems)


def test_rejects_nonpositive_litres():
    with pytest.raises(ValidationError) as ei:
        validate(base(FuelLogs=[{"assetTag": "HT-01", "date": "2026-06-01", "litres": 0,
                                 "cost": 10, "engineHoursAtFill": 5}]))
    assert any("litres must be > 0" in p for p in ei.value.problems)
