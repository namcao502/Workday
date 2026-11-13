import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AgentStats, HrmTask } from '@workday/core'
import { describe, expect, it } from 'vitest'
import { loadConfig } from '../config.js'
import { boardWith, makeTicket } from '../testing/fakes.js'
import { ReportReader, type ReportReaderDeps } from './reportReader.js'

const RANGE = { kind: 'custom', from: '2026-10-19', to: '2026-10-25' } as const

function session(): AgentStats {
  return {
    contextTokens: null,
    contextWindow: 200000,
    model: null,
    sessions: 1,
    turns: 2,
    turnSeconds: 30,
    inputTokens: 100,
    outputTokens: 50,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    compacts: [],
    skills: [],
    subagents: [],
    tools: {},
    apiErrors: [],
    lastActivity: '2026-10-21T03:00:00.000Z',
    days: {
      '2026-10-21': {
        inputTokens: 100,
        outputTokens: 50,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        turns: 2,
        turnSeconds: 30,
      },
    },
  }
}

const TASKS: readonly HrmTask[] = [
  { date: '2026-10-21', ticketKey: 'MDP-1', summary: null, workingSeconds: 7200 },
]

function deps(overrides: Partial<ReportReaderDeps> = {}): ReportReaderDeps {
  const config = loadConfig(mkdtempSync(join(tmpdir(), 'workday-cfg-')))
  return {
    board: () =>
      boardWith({
        inProgress: { 'MDP-1': makeTicket('MDP-1', { summary: 'Fix it', status: 'In Progress' }) },
        done: { 'MDP-2': makeTicket('MDP-2') },
      }),
    config: () => config,
    hrmTasks: () => Promise.resolve(TASKS),
    agent: {
      keys: () => ['MDP-3'],
      readAndSave: () => Promise.resolve([session()]),
    },
    commits: () => Promise.resolve({ 'MDP-1': { commits: 3, files: 4, added: 5, deleted: 6 } }),
    now: () => new Date('2026-10-26T01:00:00Z'),
    logError: () => undefined,
    ...overrides,
  }
}

describe('ReportReader', () => {
  it('read runs the four sources and builds the report', async () => {
    const asked: string[] = []
    const reader = new ReportReader(
      deps({
        agent: {
          keys: () => ['MDP-3'],
          readAndSave: (key) => {
            asked.push(key)
            return Promise.resolve([session()])
          },
        },
      }),
    )

    const view = await reader.read(RANGE)

    expect(asked.sort()).toEqual(['MDP-1', 'MDP-2', 'MDP-3'])
    expect(view.readAt).toBe('2026-10-26T01:00:00.000Z')
    expect(view.report.hoursRead).toBe(true)
    const first = view.report.rows.find((row) => row.ticketKey === 'MDP-1')
    expect(first?.hours).toBe(2)
    expect(first?.commits?.commits).toBe(3)
    expect(first?.facts).toEqual({
      summary: 'Fix it',
      status: 'In Progress',
      section: 'inProgress',
    })
    expect(first?.tokens.inputTokens).toBe(100)
  })

  it('read keeps hours unread when HRM fails', async () => {
    const failing = new ReportReader(deps({ hrmTasks: () => Promise.reject(new Error('down')) }))
    const missing = new ReportReader(deps({ hrmTasks: () => Promise.resolve(null) }))

    expect((await failing.read(RANGE)).report.hoursRead).toBe(false)
    const view = await missing.read(RANGE)
    expect(view.report.hoursRead).toBe(false)
    expect(view.report.rows.find((row) => row.ticketKey === 'MDP-1')?.hours).toBeNull()
  })

  it('shares a running read of the same range and queues a different one', async () => {
    let started = 0
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const reader = new ReportReader(
      deps({
        commits: async () => {
          started += 1
          await gate
          return {}
        },
      }),
    )

    const first = reader.read(RANGE)
    const same = reader.read(RANGE)
    const other = reader.read({ ...RANGE, to: '2026-10-26' })
    await Promise.resolve()
    expect(started).toBe(1)
    release()
    await Promise.all([first, same, other])

    expect(first).toBe(same)
    expect(started).toBe(2)
  })
})
