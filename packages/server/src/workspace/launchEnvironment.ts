import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { claudeProjectDirName, isClaudeSessionVariable } from '@workday/core'

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isGuid(value: string): boolean {
  return GUID.test(value)
}

// The installed native binary, else the bare name looked up on PATH.
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
