import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { loadMasterKey, openSecret, sealSecret } from './secretBox.js'

let directory = ''

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'workday-secretbox-'))
  vi.stubEnv('WORKDAY_MASTER_KEY', '')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

it('sealSecret round-trips and openSecret returns null for another key', () => {
  const key = randomBytes(32)
  const sealed = sealSecret(key, 'hunter2')
  expect(sealed.startsWith('enc:v1:')).toBe(true)
  expect(sealed).not.toContain('hunter2')
  expect(openSecret(key, sealed)).toBe('hunter2')
  expect(openSecret(randomBytes(32), sealed)).toBeNull()
  expect(openSecret(key, 'enc:v1:not-base64-data')).toBeNull()
})

it('two seals of the same text differ', () => {
  const key = randomBytes(32)
  expect(sealSecret(key, 'same')).not.toBe(sealSecret(key, 'same'))
})

it('the master key is created once and reused', () => {
  const first = loadMasterKey(directory)
  expect(first.length).toBe(32)
  expect(loadMasterKey(directory).equals(first)).toBe(true)
  expect(readFileSync(join(directory, 'master.key')).length).toBe(32)
})

it('WORKDAY_MASTER_KEY wins over the file and must be 32 bytes of base64', () => {
  const key = randomBytes(32)
  vi.stubEnv('WORKDAY_MASTER_KEY', key.toString('base64'))
  expect(loadMasterKey(directory).equals(key)).toBe(true)
  vi.stubEnv('WORKDAY_MASTER_KEY', randomBytes(16).toString('base64'))
  expect(() => loadMasterKey(directory)).toThrow(/WORKDAY_MASTER_KEY/)
})
