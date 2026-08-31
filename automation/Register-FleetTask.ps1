<#
.SYNOPSIS
    Register (or update) a Windows Scheduled Task that runs the fleet pipeline
    daily.

.DESCRIPTION
    Wraps Invoke-FleetPipeline.ps1 in a Scheduled Task. Run from an elevated
    PowerShell prompt. Use -Unregister to remove it.

.EXAMPLE
    # daily at 05:00, hitting a deployed API
    ./Register-FleetTask.ps1 -Time 05:00 -ApiBase https://fleet-api.onrender.com

.EXAMPLE
    ./Register-FleetTask.ps1 -Unregister
#>
[CmdletBinding()]
param(
    [string] $TaskName = "FleetAssetPipeline",
    [string] $Time     = "05:00",
    [string] $ApiBase  = "http://localhost:4000",
    [switch] $Unregister
)

$ErrorActionPreference = "Stop"

if ($Unregister) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "Removed scheduled task '$TaskName'."
    return
}

$pipeline = Join-Path $PSScriptRoot "Invoke-FleetPipeline.ps1"
if (-not (Test-Path $pipeline)) { throw "cannot find $pipeline" }

$action = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$pipeline`" -ApiBase `"$ApiBase`""
$trigger  = New-ScheduledTaskTrigger -Daily -At $Time
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopOnIdleEnd `
    -RunOnlyIfNetworkAvailable
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
    -Settings $settings -Principal $principal -Force `
    -Description "Fleet Asset Tracking: daily ingest + report + evaluation" | Out-Null

Write-Host "Registered scheduled task '$TaskName' — daily at $Time, ApiBase=$ApiBase."
Write-Host "Run now with:  Start-ScheduledTask -TaskName $TaskName"
