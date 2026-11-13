import { existsSync, readdirSync } from 'node:fs'
import { basename, delimiter, dirname, join } from 'node:path'
import { claudeProjectDirName, isClaudeSessionVariable } from '@workday/core'

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isGuid(value: string): boolean {
  return GUID.test(value)
}

export function findPowerShell7(pathValue: string | undefined): string | null {
  for (const folder of (pathValue ?? '').split(delimiter)) {
    const candidate = folder.trim() === '' ? '' : join(folder.trim(), 'pwsh.exe')
    if (candidate !== '' && existsSync(candidate)) {
      return candidate
    }
  }
  return null
}

// On Windows the fallback is claude.exe: a bare `claude` inside the shell's claude function would call itself.
export function defaultClaudeExecutable(homeDir: string, isWindows: boolean): string {
  const fileName = isWindows ? 'claude.exe' : 'claude'
  const installed = join(homeDir, '.local', 'bin', fileName)
  return existsSync(installed) ? installed : fileName
}

// Claude variables inherited from a Claude Code parent would make the new claude act as its child.
export function sessionEnvironment(
  source: Readonly<Record<string, string | undefined>>,
): Readonly<Record<string, string>> {
  const kept = Object.entries(source).filter(
    (entry): entry is [string, string] =>
      entry[1] !== undefined && !isClaudeSessionVariable(entry[0]),
  )
  return { ...Object.fromEntries(kept), TERM: 'xterm-256color' }
}

export function projectFolder(projectsRoot: string, cwd: string): string {
  return join(projectsRoot, claudeProjectDirName(cwd))
}

export function transcriptExists(projectsRoot: string, cwd: string, sessionId: string): boolean {
  return existsSync(join(projectFolder(projectsRoot, cwd), `${sessionId.toLowerCase()}.jsonl`))
}

export function folderHasTranscripts(projectsRoot: string, cwd: string): boolean {
  try {
    return readdirSync(projectFolder(projectsRoot, cwd)).some((name) => name.endsWith('.jsonl'))
  } catch {
    return false
  }
}

// Tells a claude started in this folder from one the user started elsewhere after a cd.
export function isTranscriptOfFolder(transcriptPath: string | null, cwd: string): boolean {
  if (transcriptPath === null || transcriptPath === '') {
    return false
  }
  const normalized = transcriptPath.replaceAll('\\', '/')
  const folderName = basename(dirname(normalized))
  return folderName.toLowerCase() === claudeProjectDirName(cwd).toLowerCase()
}
