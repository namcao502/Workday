import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { BoardState, Ticket } from '@workday/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadBoard, saveBoard } from './boardStore.js'

let directory = ''

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'workday-board-'))
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

function ticket(key: string, overrides: Partial<Ticket> = {}): Ticket {
  return {
    key,
    summary: 'Summary',
    dueDate: '2026-11-20',
    eta: null,
    devPriority: 2,
    status: 'In Progress',
    statusCategory: 'indeterminate',
    issueType: 'Task',
    timeSpentSeconds: 3600,
    updated: '2026-11-01T10:00:00.000+0700',
    parentKey: null,
    ...overrides,
  }
}

const EMPTY_BOARD: BoardState = {
  new: {},
  inProgress: {},
  done: {},
  dismissed: {},
  seenKeys: null,
}

describe('boardStore', () => {
  it('loads an empty never-polled board when there is no file', () => {
    expect(loadBoard(directory)).toEqual(EMPTY_BOARD)
  })

  it('round-trips a BoardState', async () => {
    const board: BoardState = {
      new: { 'MDP-1': ticket('MDP-1') },
      inProgress: { 'MDP-2': ticket('MDP-2', { parentKey: 'MDP-1' }) },
      done: { 'MDP-3': ticket('MDP-3', { statusCategory: 'done' }) },
      dismissed: { 'MDP-4': { ticket: ticket('MDP-4'), origin: 'inProgress' } },
      seenKeys: ['MDP-1', 'MDP-2'],
    }
    await saveBoard(directory, board)
    expect(loadBoard(directory)).toEqual(board)
  })

  it('a board.json of the wrong shape loads as empty and is kept as .bad', () => {
    const file = join(directory, 'board.json')
    writeFileSync(file, JSON.stringify({ ...EMPTY_BOARD, new: { 'MDP-1': { key: 'MDP-1' } } }))
    expect(loadBoard(directory)).toEqual(EMPTY_BOARD)
    expect(existsSync(`${file}.bad`)).toBe(true)
  })
})
