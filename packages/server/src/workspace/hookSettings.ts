import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const HOOKS_FOLDER = 'claude-hooks'
const HOOK_TIMEOUT_SECONDS = 5
const HOOK_EVENTS: readonly string[] = [
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'Notification',
  'Stop',
  'SessionEnd',
]

// Claude merges these with the user's own hooks (all matching hooks run).
export function hookSettingsJson(url: string): string {
  const hooks = Object.fromEntries(
    HOOK_EVENTS.map((eventName) => [
      eventName,
      [{ hooks: [{ type: 'http', url, timeout: HOOK_TIMEOUT_SECONDS }] }],
    ]),
  )
  return JSON.stringify({ hooks })
}

// Null (logged) when the file cannot be written; the session then starts without hooks.
export function writeHookSettings(
  dataDir: string,
  session: string,
  url: string,
  logError: (message: string, error: unknown) => void = console.error,
): string | null {
  try {
    const folder = join(dataDir, HOOKS_FOLDER)
    mkdirSync(folder, { recursive: true })
    const path = join(folder, `${session}.json`)
    writeFileSync(path, hookSettingsJson(url))
    return path
  } catch (error: unknown) {
    logError(`Could not write the hook settings of ${session}`, error)
    return null
  }
}
