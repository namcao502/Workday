import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BackupError, createBackup, openBackup, sealBackup } from './backupFile.js'

const FAST_N = 16384
const NOW = new Date('2026-11-20T10:00:00Z')

function newDir(): string {
  return mkdtempSync(join(tmpdir(), 'workday-backup-'))
}

function sample(): string {
  const dir = newDir()
  writeFileSync(join(dir, 'config.json'), '{"a":1}')
  writeFileSync(join(dir, 'secrets.json'), 'enc:v1:xyz')
  writeFileSync(join(dir, 'master.key'), Buffer.alloc(32, 7))
  return dir
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise
  } catch (error) {
    if (error instanceof BackupError) {
      return error.code
    }
  }
  return 'none'
}

describe('backup file', () => {
  it('round trip restores every file and master.key', async () => {
    const text = await createBackup(sample(), 'password-1', NOW, FAST_N)
    const files = await openBackup(text, 'password-1')
    expect([...files.keys()].sort()).toEqual(['config.json', 'master.key', 'secrets.json'])
    expect(files.get('config.json')?.toString()).toBe('{"a":1}')
    expect(files.get('master.key')).toEqual(Buffer.alloc(32, 7))
  })

  it('wrong password is backupWrongPassword', async () => {
    const text = await createBackup(sample(), 'password-1', NOW, FAST_N)
    expect(await codeOf(openBackup(text, 'password-2'))).toBe('backupWrongPassword')
  })

  it('tampered data or wrong format is backupInvalid', async () => {
    const text = await createBackup(sample(), 'password-1', NOW, FAST_N)
    const parsed = JSON.parse(text) as Record<string, unknown>
    expect(await codeOf(openBackup('not json', 'password-1'))).toBe('backupInvalid')
    expect(await codeOf(openBackup(JSON.stringify({ ...parsed, format: 'x' }), 'p'))).toBe(
      'backupInvalid',
    )
    expect(await codeOf(openBackup(JSON.stringify({ ...parsed, version: 2 }), 'p'))).toBe(
      'backupInvalid',
    )
    expect(await codeOf(openBackup(JSON.stringify({ ...parsed, iv: 'AA==' }), 'p'))).toBe(
      'backupInvalid',
    )
    const kdf = { ...(parsed['kdf'] as object), N: 3 }
    expect(await codeOf(openBackup(JSON.stringify({ ...parsed, kdf }), 'p'))).toBe('backupInvalid')
    const flipped = Buffer.from(parsed['data'] as string, 'base64')
    flipped[0] = (flipped[0] ?? 0) ^ 1
    const tampered = JSON.stringify({ ...parsed, data: flipped.toString('base64') })
    expect(await codeOf(openBackup(tampered, 'password-1'))).toBe('backupWrongPassword')
  })

  it('desktop.json, folders, .bad and .before- files are left out', async () => {
    const dir = sample()
    writeFileSync(join(dir, 'desktop.json'), '{}')
    writeFileSync(join(dir, 'config.json.bad'), 'x')
    writeFileSync(join(dir, 'board.json.before-import'), 'x')
    writeFileSync(join(dir, 'scan.log'), 'x')
    writeFileSync(join(dir, '.hidden'), 'x')
    mkdirSync(join(dir, 'tmp'))
    writeFileSync(join(dir, 'tmp', 'a.txt'), 'x')
    const files = await openBackup(await createBackup(dir, 'password-1', NOW, FAST_N), 'password-1')
    expect([...files.keys()].sort()).toEqual(['config.json', 'master.key', 'secrets.json'])
  })

  it('a name with a path separator is rejected', async () => {
    const files = { '../evil': Buffer.from('x').toString('base64') }
    const forged = await sealBackup(files, 'pw', NOW, FAST_N)
    expect(await codeOf(openBackup(forged, 'pw'))).toBe('backupInvalid')
  })
})
