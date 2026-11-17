import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { loadMasterKey, openSecret, sealSecret } from '../security/secretBox.js'

const TOKEN_FILE = 'graph-token.json'

export interface StoredGraphToken {
  readonly token: string
  readonly expiresAtMilliseconds: number
}

// Where the Graph token waits between server restarts; a restart is no reason to open the browser again.
export interface GraphTokenStore {
  load(): StoredGraphToken | null
  save(stored: StoredGraphToken): void
  clear(): void
}

function isStored(value: unknown): value is StoredGraphToken {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const record = value as Record<string, unknown>
  return typeof record['token'] === 'string' && typeof record['expiresAtMilliseconds'] === 'number'
}

// One encrypted file in the data dir, sealed with the same master key as secrets.json. Failures are swallowed:
// without the file the next read simply asks the browser again.
export function fileGraphTokenStore(dataDir: string): GraphTokenStore {
  const path = join(dataDir, TOKEN_FILE)
  return {
    load: () => {
      try {
        const plain = openSecret(loadMasterKey(dataDir), readFileSync(path, 'utf8'))
        const parsed: unknown = plain === null ? null : JSON.parse(plain)
        return isStored(parsed) ? parsed : null
      } catch {
        return null
      }
    },
    save: (stored) => {
      try {
        mkdirSync(dirname(path), { recursive: true })
        writeFileSync(path, sealSecret(loadMasterKey(dataDir), JSON.stringify(stored)))
      } catch {
        // The token stays in memory.
      }
    },
    clear: () => {
      rmSync(path, { force: true })
    },
  }
}
