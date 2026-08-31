<#
.SYNOPSIS
    Scheduled fleet data pipeline: ingest raw Excel -> refresh the Excel summary
    -> trigger the API's fleet evaluation (which auto-creates IT tickets for
    ticketable breaches).

.DESCRIPTION
    Designed to be run on a schedule by Register-FleetTask.ps1 (Windows Task
    Scheduler) or the equivalent GitHub Actions workflow. Every step is real
    work; the script exits non-zero if any step fails and writes a transcript
    to automation/logs/.

.EXAMPLE
    pwsh automation/Invoke-FleetPipeline.ps1 -ApiBase http://localhost:4000

.EXAMPLE
    powershell -File automation\Invoke-FleetPipeline.ps1 -SkipIngest
#>
[CmdletBinding()]
param(
    [string] $RawFile   = "data/raw/fleet_raw_sample.xlsx",
    [string] $ApiBase   = "http://localhost:4000",
    [string] $PythonExe = "python",
    [switch] $SkipIngest
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$logDir   = Join-Path $PSScriptRoot "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$stamp    = Get-Date -Format "yyyyMMdd-HHmmss"
$logFile  = Join-Path $logDir "pipeline-$stamp.log"

Start-Transcript -Path $logFile -Force | Out-Null
$started = Get-Date
Write-Host "=== Fleet pipeline $stamp ==="
Write-Host "repo root : $repoRoot"
Write-Host "api base  : $ApiBase"

try {
    Push-Location $repoRoot

    if (-not $SkipIngest) {
        Write-Host "`n[1/4] Ingesting raw workbook: $RawFile"
        & $PythonExe -m fleet_analytics ingest --file $RawFile
        if ($LASTEXITCODE -ne 0) { throw "ingest failed (exit $LASTEXITCODE)" }
    }
    else {
        Write-Host "`n[1/4] Ingest skipped (-SkipIngest)"
    }

    Write-Host "`n[2/4] Rebuilding Excel summary report"
    & $PythonExe -m fleet_analytics report
    if ($LASTEXITCODE -ne 0) { throw "report failed (exit $LASTEXITCODE)" }

    Write-Host "`n[3/4] Triggering fleet evaluation on the API"
    $summary = Invoke-RestMethod -Method Post -Uri "$ApiBase/api/alerts/evaluate" `
        -Body '{}' -ContentType 'application/json' -TimeoutSec 60
    Write-Host ("       evaluated={0} newFlags={1} ticketsCreated={2} ticketFailures={3}" -f `
        $summary.evaluated, $summary.newFlags, $summary.ticketsCreated, $summary.ticketFailures)

    Write-Host "`n[4/4] API health check"
    $health = Invoke-RestMethod -Uri "$ApiBase/health" -TimeoutSec 20
    Write-Host ("       ok={0} mode={1}" -f $health.ok, $health.mode)

    $elapsed = [int]((Get-Date) - $started).TotalSeconds
    Write-Host "`n=== Pipeline OK in ${elapsed}s ==="
    Stop-Transcript | Out-Null
    exit 0
}
catch {
    Write-Error "PIPELINE FAILED: $_"
    if (Get-Command Stop-Transcript -ErrorAction SilentlyContinue) { Stop-Transcript | Out-Null }
    exit 1
}
finally {
    Pop-Location -ErrorAction SilentlyContinue
}
