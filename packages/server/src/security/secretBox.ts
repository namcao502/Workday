import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const MASTER_KEY_FILE = 'master.key'
const MASTER_KEY_ENVIRONMENT_VARIABLE = 'WORKDAY_MASTER_KEY'
const KEY_BYTES = 32
const IV_BYTES = 12
const TAG_BYTES = 16
const OWNER_ONLY_MODE = 0o600
export const SEALED_PREFIX = 'enc:v1:'

// WORKDAY_MASTER_KEY (base64) wins over the file; the file is created on first use.
export function loadMasterKey(dataDir: string): Buffer {
  const fromEnvironment = process.env[MASTER_KEY_ENVIRONMENT_VARIABLE]
  if (fromEnvironment !== undefined && fromEnvironment !== '') {
    const key = Buffer.from(fromEnvironment, 'base64')
    if (key.length !== KEY_BYTES) {
      throw new Error(`${MASTER_KEY_ENVIRONMENT_VARIABLE} must be base64 of exactly 32 bytes`)
    }
    return key
  }
  const path = join(dataDir, MASTER_KEY_FILE)
  if (existsSync(path)) {
    return readFileSync(path)
  }
  const created = randomBytes(KEY_BYTES)
  mkdirSync(dataDir, { recursive: true })
  const mode = process.platform === 'win32' ? undefined : OWNER_ONLY_MODE
  writeFileSync(path, created, { mode })
  return created
}

export function sealSecret(key: Buffer, plain: string): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return SEALED_PREFIX + Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64')
}

// Null for any value that will not decrypt: wrong key, tampered or malformed.
export function openSecret(key: Buffer, sealed: string): string | null {
  if (!sealed.startsWith(SEALED_PREFIX)) {
    return null
  }
  try {
    const bytes = Buffer.from(sealed.slice(SEALED_PREFIX.length), 'base64')
    if (bytes.length < IV_BYTES + TAG_BYTES) {
      return null
    }
    const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, IV_BYTES))
    decipher.setAuthTag(bytes.subarray(IV_BYTES, IV_BYTES + TAG_BYTES))
    const plain = Buffer.concat([
      decipher.update(bytes.subarray(IV_BYTES + TAG_BYTES)),
      decipher.final(),
    ])
    return plain.toString('utf8')
  } catch {
    return null
  }
}
