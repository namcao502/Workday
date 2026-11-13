import { createDecipheriv, pbkdf2Sync } from 'node:crypto'
import { parseWpfJson } from '@workday/core'
import { isRecord } from '../jsonFile.js'

// The noisworkday-tokens v1 file of NOIS Workday's TokensExport.cs.
const FORMAT = 'noisworkday-tokens'
const VERSION = 1
const KEY_BYTES = 32
const NONCE_BYTES = 12
const TAG_BYTES = 16
const MAX_ITERATIONS = 10_000_000

export type NwcredErrorCode = 'notAnExport' | 'wrongPassword'

// Carries only a code: the message never holds the file content or the password.
export class NwcredError extends Error {
  constructor(readonly code: NwcredErrorCode) {
    super(code)
    this.name = 'NwcredError'
  }
}

interface NwcredFile {
  readonly iterations: number
  readonly salt: Buffer
  readonly nonce: Buffer
  readonly tag: Buffer
  readonly data: Buffer
}

function base64Of(value: unknown): Buffer | null {
  return typeof value === 'string' && /^[A-Za-z0-9+/]*={0,2}$/.test(value)
    ? Buffer.from(value, 'base64')
    : null
}

function fileOf(text: string): NwcredFile {
  const raw = parseWpfJson(text)
  if (!isRecord(raw) || raw['Format'] !== FORMAT || raw['Version'] !== VERSION) {
    throw new NwcredError('notAnExport')
  }
  const iterations = raw['Iterations']
  const salt = base64Of(raw['Salt'])
  const nonce = base64Of(raw['Nonce'])
  const tag = base64Of(raw['Tag'])
  const data = base64Of(raw['Data'])
  if (
    typeof iterations !== 'number' ||
    !Number.isInteger(iterations) ||
    iterations < 1 ||
    iterations > MAX_ITERATIONS ||
    salt === null ||
    salt.length === 0 ||
    nonce?.length !== NONCE_BYTES ||
    tag?.length !== TAG_BYTES ||
    data === null
  ) {
    throw new NwcredError('notAnExport')
  }
  return { iterations, salt, nonce, tag, data }
}

function valuesOf(plain: string): Readonly<Record<string, string>> {
  const raw = parseWpfJson(plain)
  if (!isRecord(raw) || !Object.values(raw).every((value) => typeof value === 'string')) {
    throw new NwcredError('notAnExport')
  }
  return raw as Readonly<Record<string, string>>
}

/** The key/value pairs of a .nwcred export; throws NwcredError for a bad file or password. */
export function openNwcred(text: string, password: string): Readonly<Record<string, string>> {
  const file = fileOf(text)
  const key = pbkdf2Sync(
    Buffer.from(password, 'utf8'),
    file.salt,
    file.iterations,
    KEY_BYTES,
    'sha256',
  )
  let plain: string
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, file.nonce)
    decipher.setAuthTag(file.tag)
    plain = Buffer.concat([decipher.update(file.data), decipher.final()]).toString('utf8')
  } catch {
    throw new NwcredError('wrongPassword')
  }
  return valuesOf(plain)
}
