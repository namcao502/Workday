import { createCipheriv, createDecipheriv, randomBytes, scrypt } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { isRecord } from '../jsonFile.js'
import { findMasterKey, loadMasterKey } from '../security/secretBox.js'

const FORMAT = 'workday-backup'
const VERSION = 1
const DEFAULT_N = 32768
const SCRYPT_R = 8
const SCRYPT_P = 1
const MAX_MEMORY = 64 * 1024 * 1024
const KEY_BYTES = 32
const SALT_BYTES = 16
const IV_BYTES = 12
const TAG_BYTES = 16
const MASTER_KEY_FILE = 'master.key'
const SAFE_NAME = /^[A-Za-z0-9._-]+$/

type ScryptOptions = { N: number; r: number; p: number; maxmem: number }
const deriveKey = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>

export class BackupError extends Error {
  constructor(readonly code: 'backupWrongPassword' | 'backupInvalid') {
    super(code)
  }
}

function isLeftOut(name: string): boolean {
  return (
    name === 'desktop.json' ||
    name === MASTER_KEY_FILE ||
    name.endsWith('.bad') ||
    name.endsWith('.log') ||
    name.includes('.before-') ||
    name.startsWith('.')
  )
}

// master.key is the effective key (env or file), so the target machine can read the secrets.
function collectFiles(dataDir: string): Record<string, string> {
  const files: Record<string, string> = {}
  for (const entry of readdirSync(dataDir, { withFileTypes: true })) {
    if (entry.isFile() && !isLeftOut(entry.name)) {
      files[entry.name] = readFileSync(join(dataDir, entry.name)).toString('base64')
    }
  }
  const key = findMasterKey(dataDir) ?? loadMasterKey(dataDir)
  files[MASTER_KEY_FILE] = key.toString('base64')
  return files
}

// Takes base64 file contents; exported so tests can seal a forged file list.
export async function sealBackup(
  files: Record<string, string>,
  password: string,
  now: Date,
  n: number = DEFAULT_N,
): Promise<string> {
  const salt = randomBytes(SALT_BYTES)
  const iv = randomBytes(IV_BYTES)
  const key = await deriveKey(password, salt, KEY_BYTES, {
    N: n,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: MAX_MEMORY,
  })
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const data = Buffer.concat([cipher.update(JSON.stringify({ files }), 'utf8'), cipher.final()])
  return JSON.stringify({
    format: FORMAT,
    version: VERSION,
    createdAt: now.toISOString(),
    kdf: { name: 'scrypt', N: n, r: SCRYPT_R, p: SCRYPT_P, salt: salt.toString('base64') },
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: data.toString('base64'),
  })
}

export function createBackup(
  dataDir: string,
  password: string,
  now: Date,
  n: number = DEFAULT_N,
): Promise<string> {
  return sealBackup(collectFiles(dataDir), password, now, n)
}

function invalid(): never {
  throw new BackupError('backupInvalid')
}

function bytesOf(value: unknown, length?: number): Buffer {
  if (typeof value !== 'string') {
    return invalid()
  }
  const bytes = Buffer.from(value, 'base64')
  return length !== undefined && bytes.length !== length ? invalid() : bytes
}

function isPowerOfTwo(n: number): boolean {
  return Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0
}

function inRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
}

function parseEnvelope(text: string): {
  options: ScryptOptions
  salt: Buffer
  iv: Buffer
  tag: Buffer
  data: Buffer
} {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return invalid()
  }
  if (!isRecord(raw) || raw['format'] !== FORMAT || raw['version'] !== VERSION) {
    return invalid()
  }
  const kdf = raw['kdf']
  if (!isRecord(kdf) || kdf['name'] !== 'scrypt') {
    return invalid()
  }
  const { N, r, p } = kdf
  if (!inRange(N, 16384, 1048576) || !isPowerOfTwo(N) || !inRange(r, 1, 32) || !inRange(p, 1, 16)) {
    return invalid()
  }
  return {
    // maxmem scales with N and r (128 * N * r) so a valid large setting is not refused.
    options: { N, r, p, maxmem: Math.max(MAX_MEMORY, 256 * N * r) },
    salt: bytesOf(kdf['salt'], SALT_BYTES),
    iv: bytesOf(raw['iv'], IV_BYTES),
    tag: bytesOf(raw['tag'], TAG_BYTES),
    data: bytesOf(raw['data']),
  }
}

function parseFiles(plain: string): Map<string, Buffer> {
  let inner: unknown
  try {
    inner = JSON.parse(plain)
  } catch {
    return invalid()
  }
  const files = isRecord(inner) ? inner['files'] : null
  if (!isRecord(files)) {
    return invalid()
  }
  const result = new Map<string, Buffer>()
  for (const [name, content] of Object.entries(files)) {
    if (!SAFE_NAME.test(name) || name === '.' || name === '..') {
      return invalid()
    }
    result.set(name, bytesOf(content))
  }
  return result
}

// A wrong password and a tampered file both fail the GCM tag, so they share one code.
export async function openBackup(text: string, password: string): Promise<Map<string, Buffer>> {
  const { options, salt, iv, tag, data } = parseEnvelope(text)
  const key = await deriveKey(password, salt, KEY_BYTES, options)
  let plain: Buffer
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(tag)
    plain = Buffer.concat([decipher.update(data), decipher.final()])
  } catch {
    throw new BackupError('backupWrongPassword')
  }
  return parseFiles(plain.toString('utf8'))
}
