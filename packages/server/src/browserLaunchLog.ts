import { appendFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const LOG_FILE = 'browser-launches.log'

// Every time the app opens a browser on a Microsoft profile, one line says which one and why. A sign-in prompt on
// the phone can then be matched with a time in this file; it never holds a token, URL or page content.
export function logBrowserNote(dataDir: string, text: string): void {
  try {
    appendFileSync(join(dataDir, LOG_FILE), `${new Date().toISOString()} ${text}\n`)
  } catch {
    // The log is a diagnostic; a write failure must not stop the work.
  }
}

export function logBrowserLaunch(profileDir: string, who: 'tsc' | 'teams', purpose: string): void {
  logBrowserNote(dirname(profileDir), `${who} ${purpose}`)
}
