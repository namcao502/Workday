import type { BoardState } from '@workday/core'
import { beforeEach, describe, expect, it } from 'vitest'
import type { PromptOutcome } from '../teams/teamsHandOff.js'
import { boardWith, makeTicket } from '../testing/fakes.js'
import { AutoLineRunner } from './autoLineRunner.js'

interface Session {
  open: boolean
  working: boolean
  waiting: boolean
}

let board: BoardState
let sessions: Map<string, Session>
let worktrees: Set<string>
let sent: string[]
let opened: string[]
let runner: AutoLineRunner

function session(name: string, overrides: Partial<Session> = {}): void {
  sessions.set(name, { open: true, working: false, waiting: false, ...overrides })
}

function stateOf(name: string): PromptOutcome {
  const found = sessions.get(name)
  if (found === undefined || !found.open) {
    return 'notFound'
  }
  return found.waiting ? 'waiting' : 'sent'
}

beforeEach(() => {
  board = boardWith({ inProgress: { 'MDP-1': makeTicket('MDP-1') } })
  sessions = new Map()
  worktrees = new Set(['MDP-1', 'MDP-2'])
  sent = []
  opened = []
  runner = new AutoLineRunner({
    board: { snapshot: () => board },
    workspace: {
      promptState: stateOf,
      isWorking: (name) => sessions.get(name)?.working ?? false,
      prompt: (name, text) => {
        const outcome = stateOf(name)
        if (outcome === 'sent') {
          sent.push(`${name}: ${text}`)
        }
        return outcome
      },
      openTicketTab: (key) => {
        opened.push(key)
        session(key)
        return Promise.resolve()
      },
    },
    hasWorktree: (key) => worktrees.has(key),
    delayMs: 0,
    logError: () => undefined,
  })
})

describe('AutoLineRunner', () => {
  it('hands a line to an idle Claude and forgets it', async () => {
    session('MDP-1')
    await runner.queue([{ ticketKey: 'MDP-1', line: 'pr-comments MDP-1' }])

    expect(sent).toEqual(['MDP-1: pr-comments MDP-1'])
    expect(runner.waiting()).toEqual({})
  })

  it('waits while Claude works or asks something, and sends after the turn ends', async () => {
    session('MDP-1', { working: true })
    await runner.queue([{ ticketKey: 'MDP-1', line: 'pr-comments MDP-1' }])
    expect(sent).toEqual([])

    session('MDP-1', { waiting: true })
    await runner.run()
    expect(sent).toEqual([])

    session('MDP-1')
    await runner.run()
    expect(sent).toEqual(['MDP-1: pr-comments MDP-1'])
  })

  it('sends one line per session per run, the oldest first', async () => {
    session('MDP-1')
    await runner.queue([
      { ticketKey: 'MDP-1', line: 'pr-comments MDP-1' },
      { ticketKey: 'MDP-1', line: 'pr-refresh MDP-1' },
    ])
    expect(sent).toEqual(['MDP-1: pr-comments MDP-1'])
    expect(runner.waiting()).toEqual({ 'MDP-1': ['pr-refresh MDP-1'] })
  })

  it('opens the ticket tab when it is closed, and drops the lines of a ticket with no worktree', async () => {
    await runner.queue([
      { ticketKey: 'MDP-1', line: 'pr-comments MDP-1' },
      { ticketKey: 'MDP-3', line: 'pr-refresh MDP-3' },
    ])

    expect(opened).toEqual(['MDP-1'])
    expect(sent).toEqual(['MDP-1: pr-comments MDP-1'])
    expect(runner.waiting()).toEqual({})
  })

  it("a QC bug's line goes to its parent's Claude", async () => {
    board = boardWith({
      inProgress: {
        'MDP-1': makeTicket('MDP-1'),
        'MDP-9': makeTicket('MDP-9', { issueType: 'Bug', linkedKeys: ['MDP-1'] }),
      },
    })
    session('MDP-1')
    await runner.queue([{ ticketKey: 'MDP-9', line: 'pr-comments MDP-9' }])

    expect(sent).toEqual(['MDP-1: pr-comments MDP-9'])
  })
})
