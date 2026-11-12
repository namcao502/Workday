import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadQueue, saveQueue } from './queueStore.js'

let dataDir = ''
let queuePath = ''

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'workday-queue-'))
  queuePath = join(dataDir, 'queue.json')
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

describe('queueStore', () => {
  it('ReturnsEmptyWhenFileMissing', () => {
    expect(loadQueue(dataDir)).toEqual([])
  })

  it('RoundTripsEntries', async () => {
    await saveQueue(dataDir, [
      { date: '2026-07-24', tickets: ['MDP-1234', 'MDP-5678'], minutes: null },
      { date: '2026-07-23', tickets: ['MDP-9999'], minutes: null },
    ])

    const read = loadQueue(dataDir)
    expect(read).toEqual([
      { date: '2026-07-24', tickets: ['MDP-1234', 'MDP-5678'], minutes: null },
      { date: '2026-07-23', tickets: ['MDP-9999'], minutes: null },
    ])
    expect(readFileSync(queuePath, 'utf8')).toContain('MDP-1234')
  })

  it('RoundTripsCustomMinutes', async () => {
    await saveQueue(dataDir, [
      { date: '2026-07-24', tickets: ['MDP-1', 'MDP-2'], minutes: [360, 120] },
      { date: '2026-07-25', tickets: ['MDP-3'], minutes: null },
    ])

    const raw: unknown = JSON.parse(readFileSync(queuePath, 'utf8'))
    expect(raw).toEqual({
      entries: [
        { date: '2026-07-24', tickets: ['MDP-1', 'MDP-2'], minutes: [360, 120] },
        { date: '2026-07-25', tickets: ['MDP-3'] },
      ],
    })
    const read = loadQueue(dataDir)
    expect(read[0]?.minutes).toEqual([360, 120])
    expect(read[1]?.minutes).toBeNull()
  })

  it('DropsMalformedEntriesAndInvalidTickets', () => {
    writeFileSync(
      queuePath,
      JSON.stringify({
        entries: [
          { date: '2026-07-24', tickets: ['MDP-1', 'nope', 7] },
          { date: 'bad-date', tickets: ['MDP-2'] },
          { date: '2026-07-25', tickets: [] },
          'garbage',
        ],
      }),
    )

    expect(loadQueue(dataDir)).toEqual([{ date: '2026-07-24', tickets: ['MDP-1'], minutes: null }])
  })

  it('ReturnsEmptyOnMalformedJson', () => {
    writeFileSync(queuePath, '{ not json')

    expect(loadQueue(dataDir)).toEqual([])
    expect(existsSync(`${queuePath}.bad`)).toBe(true)
  })

  it('DropsMinutesThatDoNotMatchTheTickets', () => {
    writeFileSync(
      queuePath,
      JSON.stringify({
        entries: [
          { date: '2026-07-24', tickets: ['MDP-1', 'MDP-2'], minutes: [480] },
          { date: '2026-07-25', tickets: ['MDP-3'], minutes: [0] },
          { date: '2026-07-26', tickets: ['MDP-4'], minutes: [999] },
        ],
      }),
    )

    const read = loadQueue(dataDir)
    expect(read).toHaveLength(3)
    expect(read.map((entry) => entry.minutes)).toEqual([null, null, null])
  })

  it('ClearsWhenWrittenEmpty', async () => {
    await saveQueue(dataDir, [{ date: '2026-07-24', tickets: ['MDP-1'], minutes: null }])
    await saveQueue(dataDir, [])

    expect(loadQueue(dataDir)).toEqual([])
  })
})
