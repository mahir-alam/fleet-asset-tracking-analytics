# Automation — scheduled fleet pipeline

`Invoke-FleetPipeline.ps1` is the real scheduled job. Each run:

1. **Ingests** the raw Excel workbook into Postgres (`fleet_analytics ingest`).
2. **Rebuilds** the stakeholder Excel summary (`fleet_analytics report` → `data/exports/`).
3. **Triggers** the API's fleet evaluation (`POST /api/alerts/evaluate`), which raises
   `MaintenanceFlag`s and auto-creates IT tickets for ticketable breaches.
4. **Health-checks** the API.

It writes a transcript to `automation/logs/pipeline-<timestamp>.log` and exits non-zero
if any step fails.

## Run once, by hand

```powershell
pwsh automation/Invoke-FleetPipeline.ps1 -ApiBase http://localhost:4000
# or, Windows PowerShell 5.1:
powershell -ExecutionPolicy Bypass -File automation\Invoke-FleetPipeline.ps1 -SkipIngest
```

| Parameter     | Default                          | Purpose                                  |
| ------------- | -------------------------------- | ---------------------------------------- |
| `-RawFile`    | `data/raw/fleet_raw_sample.xlsx` | workbook to ingest                       |
| `-ApiBase`    | `http://localhost:4000`          | Fleet API base URL                       |
| `-PythonExe`  | `python`                         | Python interpreter / venv path          |
| `-SkipIngest` | off                             | skip step 1 (report + evaluate only)     |

## Schedule it (Windows Task Scheduler)

From an **elevated** PowerShell prompt:

```powershell
./automation/Register-FleetTask.ps1 -Time 05:00 -ApiBase https://fleet-api.onrender.com
Start-ScheduledTask -TaskName FleetAssetPipeline   # run immediately to test
./automation/Register-FleetTask.ps1 -Unregister    # remove
```

## Schedule it (cloud)

Render has no Task Scheduler, so the deployed environment uses
[`.github/workflows/fleet-pipeline.yml`](../.github/workflows/fleet-pipeline.yml) instead —
same four steps, on a GitHub Actions `schedule` cron. It needs two repo secrets:
`DATABASE_URL` and `FLEET_API_BASE`.
