import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FakePtyFactory } from '../testing/fakePty.js'
import { WorkspaceStartError } from './pty.js'
import { REPLAY_LIMIT, SessionHost, type SessionDirectory } from './sessionHost.js'

interface Built {
  readonly host: SessionHost
  readonly ptys: FakePtyFactory
  readonly ended: { count: number }
}

function build(
  directory: () => SessionDirectory = () => ({ path: tmpdir(), fallback: null }),
): Built {
  const ptys = new FakePtyFactory()
  const ended = { count: 0 }
  const host = new SessionHost({
    name: 'claude',
    spawn: ptys.spawn,
    directory,
    launch: () => ({ file: 'shell', args: [] }),
    env: () => ({ TERM: 'xterm-256color' }),
    onEnded: () => {
      ended.count += 1
    },
  })
  return { host, ptys, ended }
}

describe('SessionHost', () => {
  it('keeps at most 1 MB of replay, dropping the oldest chunks', () => {
    const { host, ptys } = build()
    host.start(80, 24)
    const chunk = 'x'.repeat(REPLAY_LIMIT / 4)
    ptys.last().emitData('first')
    for (let index = 0; index < 4; index++) {
      ptys.last().emitData(chunk)
    }
    const { replay } = host.attach(() => undefined)
    expect(replay.length).toBe(REPLAY_LIMIT)
    expect(replay.startsWith('first')).toBe(false)
  })

  it('attach returns the replay, then live output once each', () => {
    const { host, ptys } = build()
    host.start(80, 24)
    ptys.last().emitData('a')
    const received: string[] = []
    const { replay, detach } = host.attach((data) => received.push(data))
    ptys.last().emitData('b')
    detach()
    ptys.last().emitData('c')
    expect(replay).toBe('a')
    expect(received).toEqual(['b'])
  })

  it('ignores the output and exit of a PTY replaced by a new start', () => {
    const { host, ptys, ended } = build()
    host.start(80, 24)
    const old = ptys.last()
    host.start(80, 24)
    const received: string[] = []
    host.attach((data) => received.push(data))
    old.emitData('stale')
    old.emitExit()
    expect(old.killed).toBe(true)
    expect(received).toEqual([])
    expect(ended.count).toBe(1)
    expect(host.running).toBe(true)
  })

  it('stop fires ended but never tells views exited', () => {
    const { host, ptys, ended } = build()
    host.start(80, 24)
    const exits = { count: 0 }
    host.attach(
      () => undefined,
      () => {
        exits.count += 1
      },
    )
    host.stop()
    ptys.last().emitExit()
    expect(host.running).toBe(false)
    expect(ended.count).toBe(1)
    expect(exits.count).toBe(0)
  })

  it('a PTY exit fires ended and tells attached views exited', () => {
    const { host, ptys, ended } = build()
    host.start(80, 24)
    const exits = { count: 0 }
    host.attach(
      () => undefined,
      () => {
        exits.count += 1
      },
    )
    ptys.last().emitExit()
    expect([ended.count, exits.count]).toEqual([1, 1])
    expect(host.running).toBe(false)
  })

  it('dispose kills the PTY, tells viewers exited, and refuses a later start', () => {
    const { host, ptys } = build()
    host.start(80, 24)
    const exits = { count: 0 }
    host.attach(
      () => undefined,
      () => {
        exits.count += 1
      },
    )
    host.dispose()
    host.write('x')
    expect(ptys.last().killed).toBe(true)
    expect(ptys.last().writes).toEqual([])
    expect(exits.count).toBe(1)
    expect(() => {
      host.start(80, 24)
    }).toThrow(WorkspaceStartError)
    expect(ptys.spawned).toHaveLength(1)
  })

  it('resize to the same size does not reach the PTY', () => {
    const { host, ptys } = build()
    host.start(80, 24)
    host.resize(80, 24)
    host.resize(100, 30)
    expect(ptys.last().resizes).toEqual([{ columns: 100, rows: 30 }])
  })

  it('throws worktreeMissing when the folder is gone and there is no fallback', () => {
    const missing = join(tmpdir(), 'workday-missing-folder-xyz')
    const { host, ptys } = build(() => ({ path: missing, fallback: null }))
    expect(() => {
      host.start(80, 24)
    }).toThrow(WorkspaceStartError)
    expect(ptys.spawned).toEqual([])
  })

  it('starts in the fallback when the folder is gone', () => {
    const fallback = mkdtempSync(join(tmpdir(), 'workday-fallback-'))
    const { host, ptys } = build(() => ({ path: join(fallback, 'gone'), fallback }))
    host.start(80, 24)
    expect(ptys.last().options.cwd).toBe(fallback)
    expect(host.currentDirectory).toBe(fallback)
  })
})
