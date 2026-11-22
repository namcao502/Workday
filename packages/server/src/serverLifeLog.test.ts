import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { logServerLife } from './serverLifeLog.js'

const dirs: string[] = []

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'life-log-'))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('logServerLife', () => {
  it('appends a timestamped line per call', () => {
    const dir = tempDir()
    logServerLife(dir, 'started pid 12', new Date('2026-11-20T15:48:01.000Z'))
    logServerLife(dir, 'exit code 0', new Date('2026-11-20T15:48:02.000Z'))
    expect(readFileSync(join(dir, 'server-life.log'), 'utf8')).toBe(
      '2026-11-20T15:48:01.000Z started pid 12\n2026-11-20T15:48:02.000Z exit code 0\n',
    )
  })

  it('never throws when the folder is missing', () => {
    expect(() => {
      logServerLife(join(tempDir(), 'missing', 'deeper'), 'started', new Date())
    }).not.toThrow()
  })
})
