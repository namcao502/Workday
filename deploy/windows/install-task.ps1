<#
Registers (or with -Remove, deletes) the "Workday" Scheduled Task: runs the server at logon of the
current user, hidden, restarted on failure (3 times, 1 minute apart). Windows PowerShell 5.1 compatible.
#>
param(
    [string]$RepoDir = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path,
    [switch]$Remove
)

$ErrorActionPreference = 'Stop'
$taskName = 'Workday'

if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Host "Removed existing task '$taskName'."
}
if ($Remove) {
    return
}

$node = (Get-Command node -ErrorAction Stop).Source
$main = Join-Path $RepoDir 'packages\server\dist\main.js'
if (-not (Test-Path $main)) {
    Write-Warning "$main is missing: run 'npm run build' in $RepoDir before the task starts."
}

$user = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$action = New-ScheduledTaskAction -Execute $node -WorkingDirectory $RepoDir `
    -Argument '--env-file-if-exists=.env packages/server/dist/main.js'
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $user
$settings = New-ScheduledTaskSettingsSet -Hidden -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero)
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings `
    -Principal $principal -Description 'Workday local web app' | Out-Null
Write-Host "Registered task '$taskName' (runs at logon). Start it now with: Start-ScheduledTask -TaskName $taskName"
