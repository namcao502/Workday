import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { loadMasterKey, openSecret, sealSecret } from '../security/secretBox.js'
import type { TeamsSession } from './teamsSession.js'

const SESSION_FILE = 'teams-session.json'

// Where the Teams session waits between server restarts; a dev restart is no reason to open the browser again.
export interface TeamsSessionStore {
  load(): TeamsSession | null
  save(session: TeamsSession): void
  clear(): void
}

function isSession(value: unknown): value is TeamsSession {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const record = value as Record<string, unknown>
  return (
    typeof record['chatToken'] === 'string' &&
    typeof record['chatUrl'] === 'string' &&
    typeof record['aggregatorToken'] === 'string' &&
    typeof record['aggregatorUrl'] === 'string' &&
    (record['clientVersion'] === null || typeof record['clientVersion'] === 'string') &&
    typeof record['userAgent'] === 'string' &&
    typeof record['myId'] === 'string' &&
    typeof record['myName'] === 'string' &&
    typeof record['expiresAt'] === 'number' &&
    (record['sharePointToken'] === null || typeof record['sharePointToken'] === 'string') &&
    (record['oneDriveHost'] === null || typeof record['oneDriveHost'] === 'string')
  )
}

// One encrypted file in the data dir, sealed with the same master key as secrets.json. Failures are swallowed:
// without the file the next read simply asks the browser again.
export function fileTeamsSessionStore(dataDir: string): TeamsSessionStore {
  const path = join(dataDir, SESSION_FILE)
  return {
    load: () => {
      try {
        const plain = openSecret(loadMasterKey(dataDir), readFileSync(path, 'utf8'))
        const parsed: unknown = plain === null ? null : JSON.parse(plain)
        return isSession(parsed) ? parsed : null
      } catch {
        return null
      }
    },
    save: (session) => {
      try {
        mkdirSync(dirname(path), { recursive: true })
        writeFileSync(path, sealSecret(loadMasterKey(dataDir), JSON.stringify(session)))
      } catch {
        // The session stays in memory.
      }
    },
    clear: () => {
      rmSync(path, { force: true })
    },
  }
}
