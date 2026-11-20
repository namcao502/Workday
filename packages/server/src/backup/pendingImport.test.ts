import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { applyPendingImport, stageImport } from './pendingImport.js'

const NOW = new Date('2026-11-20T10:05:09Z')

function newDir(): string {
  return mkdtempSync(join(tmpdir(), 'workday-import-'))
}

describe('pending import', () => {
  it('apply moves old files aside and installs the pending ones', async () => {
    const dir = newDir()
    writeFileSync(join(dir, 'config.json'), 'old')
    await stageImport(
      dir,
      new Map([
        ['config.json', Buffer.from('new')],
        ['board.json', Buffer.from('board')],
      ]),
    )
    const log = vi.fn()
    applyPendingImport(dir, NOW, log)
    expect(readFileSync(join(dir, 'config.json'), 'utf8')).toBe('new')
    expect(readFileSync(join(dir, 'board.json'), 'utf8')).toBe('board')
    expect(existsSync(join(dir, 'import-pending'))).toBe(false)
    const aside = readdirSync(dir).filter((name) => name.startsWith('before-import-'))
    expect(aside).toHaveLength(1)
    expect(readFileSync(join(dir, aside[0] ?? '', 'config.json'), 'utf8')).toBe('old')
    expect(log).toHaveBeenCalledTimes(1)
  })

  it('no pending folder changes nothing', () => {
    const dir = newDir()
    mkdirSync(join(dir, 'tmp'))
    writeFileSync(join(dir, 'config.json'), 'old')
    const log = vi.fn()
    applyPendingImport(dir, NOW, log)
    expect(readdirSync(dir).sort()).toEqual(['config.json', 'tmp'])
    expect(log).not.toHaveBeenCalled()
  })

  it('staging again replaces an older pending folder', async () => {
    const dir = newDir()
    await stageImport(dir, new Map([['a.json', Buffer.from('1')]]))
    await stageImport(dir, new Map([['b.json', Buffer.from('2')]]))
    expect(readdirSync(join(dir, 'import-pending'))).toEqual(['b.json'])
  })
})
