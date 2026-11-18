import { spawn } from 'node:child_process'
import { isIpv4Cidr, type AppError } from '@workday/core'

export const FIREWALL_RULE_NAME = 'Workday Remote'
const MAX_PORT = 65_535
const CANCELLED_MARKER = 'canceled by the user'

export type FirewallResult =
  { readonly ok: true } | { readonly ok: false; readonly error: AppError }

export interface ElevatedOutcome {
  readonly exitCode: number
  readonly stderr: string
}

// Runs powershell.exe with an args array; a port so tests never start a real one.
export type RunElevated = (args: readonly string[]) => Promise<ElevatedOutcome>

// Throws on an empty or non-IPv4-CIDR range and on a port outside 1-65535, so nothing odd reaches PowerShell.
export function firewallCommand(
  ports: readonly number[],
  allowedRanges: readonly string[],
): string {
  if (ports.length === 0 || ports.some((p) => !Number.isInteger(p) || p < 1 || p > MAX_PORT)) {
    throw new Error('Firewall ports must be integers from 1 to 65535')
  }
  if (allowedRanges.length === 0 || !allowedRanges.every(isIpv4Cidr)) {
    throw new Error('Firewall ranges must be a non-empty list of IPv4 CIDR ranges')
  }
  return (
    `Remove-NetFirewallRule -DisplayName '${FIREWALL_RULE_NAME}' -ErrorAction SilentlyContinue; ` +
    `New-NetFirewallRule -DisplayName '${FIREWALL_RULE_NAME}' -Direction Inbound -Protocol TCP ` +
    `-LocalPort ${ports.join(',')} -RemoteAddress ${allowedRanges.join(',')} -Profile Any -Action Allow`
  )
}

const runPowerShell: RunElevated = (args) =>
  new Promise((resolve) => {
    const child = spawn('powershell.exe', [...args], { windowsHide: true })
    let stderr = ''
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
    })
    child.on('error', (error) => {
      resolve({ exitCode: 1, stderr: error.message })
    })
    child.on('close', (code) => {
      resolve({ exitCode: code ?? 1, stderr })
    })
  })

// The inner command travels only as -EncodedCommand (base64 UTF-16LE), never inside the outer command line.
export async function openFirewall(
  command: string,
  run: RunElevated = runPowerShell,
): Promise<FirewallResult> {
  // Stop makes a failed cmdlet end the elevated process with a nonzero code, which -PassThru hands back.
  const encoded = Buffer.from(`$ErrorActionPreference = 'Stop'; ${command}`, 'utf16le').toString(
    'base64',
  )
  const outer =
    '$elevated = Start-Process powershell.exe -Verb RunAs -Wait -PassThru -WindowStyle Hidden ' +
    `-ArgumentList '-NoProfile','-EncodedCommand','${encoded}'; exit $elevated.ExitCode`
  const outcome = await run(['-NoProfile', '-Command', outer])
  if (outcome.exitCode === 0) {
    return { ok: true }
  }
  const cancelled = outcome.stderr.toLowerCase().includes(CANCELLED_MARKER)
  return { ok: false, error: { code: cancelled ? 'firewallCancelled' : 'firewallFailed' } }
}
