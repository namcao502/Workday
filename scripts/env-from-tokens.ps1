# Writes the repo-root .env as a plain-text copy of NOIS Workday's tokens.env (DPAPI values decrypted for this
# Windows user), plus WORKDAY_JIRA_API_TOKEN. Prints no secret. .env is gitignored; never commit it.
param(
	[string]$Source = 'C:\Project\Backend-DotNet\docs\local-config\tokens.env'
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security

if (-not (Test-Path $Source)) {
	Write-Error "tokens.env not found at $Source"
}
$destination = Join-Path (Split-Path $PSScriptRoot -Parent) '.env'

$plainLines = Get-Content $Source | ForEach-Object {
	if ($_ -match '^\s*([^#=\s][^=]*?)\s*=\s*dpapi:(.+)$') {
		$bytes = [Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($Matches[2].Trim()), $null, 'CurrentUser')
		"$($Matches[1])=$([Text.Encoding]::UTF8.GetString($bytes))"
	}
	else {
		$_
	}
}
$jiraToken = ($plainLines | Where-Object { $_ -match '^JIRA_API_TOKEN=' } | Select-Object -Last 1) -replace '^JIRA_API_TOKEN=', ''

@('# Plain-text copy of tokens.env. Gitignored; never commit.') + $plainLines + "WORKDAY_JIRA_API_TOKEN=$jiraToken" |
	Set-Content -Encoding utf8 $destination
Write-Output "Wrote $destination ($($plainLines.Count) lines)"
