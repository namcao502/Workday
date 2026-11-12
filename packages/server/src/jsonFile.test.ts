import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readJson, writeJsonAtomic } from './jsonFile.js'

function parseCount(raw: unknown): number | null {
  if (typeof raw === 'object' && raw !== null && 'count' in raw && typeof raw.count === 'number') {
    return raw.count
  }
  return null
}

let directory = ''

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'workday-json-'))
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('readJson', () => {
  it('returns the default when the file is missing', () => {
    expect(readJson(join(directory, 'none.json'), parseCount, 7)).toBe(7)
  })

  it('returns the parsed value of a valid file', () => {
    const file = join(directory, 'ok.json')
    writeFileSync(file, '{"count":3}')
    expect(readJson(file, parseCount, 7)).toBe(3)
  })

  it('renames a corrupt file to .bad and returns the default', () => {
    const file = join(directory, 'broken.json')
    writeFileSync(file, '{not json')
    expect(readJson(file, parseCount, 7)).toBe(7)
    expect(existsSync(file)).toBe(false)
    expect(readFileSync(`${file}.bad`, 'utf8')).toBe('{not json')
  })

  it('renames a file of the wrong shape to .bad, overwriting an older .bad', () => {
    const file = join(directory, 'shape.json')
    writeFileSync(`${file}.bad`, 'old')
    writeFileSync(file, '{"count":"three"}')
    expect(readJson(file, parseCount, 7)).toBe(7)
    expect(readFileSync(`${file}.bad`, 'utf8')).toBe('{"count":"three"}')
  })
})

describe('writeJsonAtomic', () => {
  it('creates the directory and writes the value', async () => {
    const file = join(directory, 'nested', 'deeper', 'out.json')
    await writeJsonAtomic(file, { count: 1 })
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ count: 1 })
  })

  it('leaves the old file intact when the write fails', async () => {
    const file = join(directory, 'keep.json')
    writeFileSync(file, '{"count":1}')
    mkdirSync(`${file}.tmp`)
    await expect(writeJsonAtomic(file, { count: 2 })).rejects.toThrow()
    expect(readFileSync(file, 'utf8')).toBe('{"count":1}')
  })
})
