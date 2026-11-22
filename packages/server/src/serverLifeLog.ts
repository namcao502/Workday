import { appendFileSync } from 'node:fs'
import { join } from 'node:path'

const LOG_FILE = 'server-life.log'

// Written by the server itself: after "Update desktop app" its stdout leads to an exited shell, so a crash goes nowhere.
export function logServerLife(dataDir: string, text: string, now: Date): void {
  try {
    appendFileSync(join(dataDir, LOG_FILE), `${now.toISOString()} ${text}\n`)
  } catch {
    // The log is a diagnostic; a write failure must not stop the server.
  }
}
