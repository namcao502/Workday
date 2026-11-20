<#
Publishes the Workday desktop shell to %LOCALAPPDATA%\Programs\Workday and creates the Start Menu shortcut
"Workday.lnk". With -Remove it deletes the folder, the shortcut and the Run key value. Windows PowerShell 5.1 compatible.
The tray's "Update desktop app" runs it with -WaitPid (the exiting app), -Relaunch and -LogPath.
#>
param(
    [string]$RepoDir = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path,
    [switch]$Remove,
    [int]$WaitPid = 0,
    [switch]$Relaunch,
    [string]$LogPath = ''
)

$ErrorActionPreference = 'Stop'
if ($LogPath) {
    Start-Transcript -Path $LogPath -Force | Out-Null
}
if ($WaitPid -gt 0) {
    # The running exe locks its files, so publish only after it has exited.
    Wait-Process -Id $WaitPid -Timeout 60 -ErrorAction SilentlyContinue
}
$installDir = Join-Path $env:LOCALAPPDATA 'Programs\Workday'
$shortcut = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Workday.lnk'
$runKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'

if ($Remove) {
    Get-Process -Name 'WorkdayDesktop' -ErrorAction SilentlyContinue |
        Where-Object { $_.Path -eq (Join-Path $installDir 'WorkdayDesktop.exe') } | Stop-Process
    if (Test-Path $installDir) {
        Remove-Item $installDir -Recurse -Force
        Write-Host "Removed $installDir."
    }
    if (Test-Path $shortcut) {
        Remove-Item $shortcut -Force
        Write-Host "Removed $shortcut."
    }
    if (Get-ItemProperty -Path $runKey -Name 'Workday' -ErrorAction SilentlyContinue) {
        Remove-ItemProperty -Path $runKey -Name 'Workday'
        Write-Host "Removed the Run key value 'Workday'."
    }
    return
}

$exe = Join-Path $installDir 'WorkdayDesktop.exe'
try {
    dotnet publish (Join-Path $RepoDir 'desktop\WorkdayDesktop') -c Release -r win-x64 --self-contained false -o $installDir
    if ($LASTEXITCODE -ne 0) {
        throw "dotnet publish failed with exit code $LASTEXITCODE."
    }
}
finally {
    # A failed publish still reopens the app (the old build), so the tray never just disappears.
    if ($Relaunch -and (Test-Path $exe)) {
        Start-Process -FilePath $exe
    }
}

# The installed exe sits outside the repo, so it cannot find the server by walking up: record the repo once.
$dataDir = if ($env:WORKDAY_DATA_DIR) { $env:WORKDAY_DATA_DIR } else { Join-Path $env:APPDATA 'Workday' }
$settingsPath = Join-Path $dataDir 'desktop.json'
$settings = if (Test-Path $settingsPath) { Get-Content $settingsPath -Raw | ConvertFrom-Json } else { New-Object PSObject }
if (-not $settings.serverDir) {
    $settings | Add-Member -NotePropertyName 'serverDir' -NotePropertyValue $RepoDir -Force
    New-Item -ItemType Directory -Force $dataDir | Out-Null
    $settings | ConvertTo-Json -Depth 5 | Set-Content -Path $settingsPath -Encoding UTF8
    Write-Host "Set serverDir to $RepoDir in $settingsPath."
}

$shell = New-Object -ComObject WScript.Shell
$link = $shell.CreateShortcut($shortcut)
$link.TargetPath = $exe
$link.WorkingDirectory = $installDir
$link.Save()
Write-Host "Installed to $installDir. Start Menu shortcut: $shortcut"
