import type { AppError, BoardState, PollChanges, Ticket } from '@workday/core'
import { describe, expect, it } from 'vitest'
import type { NoticeInput } from '../notices/noticeService.js'
import { boardWith, deferred, makeTicket } from '../testing/fakes.js'
import { PollReactions } from './pollReactions.js'

const NOTHING: PollChanges = { newTickets: [], reopened: [], finished: [] }
const OK = { ok: true } as const

function byKey(...tickets: Ticket[]): Record<string, Ticket> {
  return Object.fromEntries(tickets.map((ticket) => [ticket.key, ticket]))
}

interface Harness {
  readonly reactions: PollReactions
  readonly notices: NoticeInput[]
  readonly started: string[]
  readonly fixed: string[]
}

function harness(
  options: {
    board?: BoardState
    autoStart?: boolean
    start?: (key: string) => Promise<typeof OK | { ok: false; error: AppError }>
  } = {},
): Harness {
  const notices: NoticeInput[] = []
  const started: string[] = []
  const fixed: string[] = []
  const reactions = new PollReactions({
    notices: {
      add: (input) => {
        notices.push(input)
        return Promise.resolve()
      },
    },
    board: { snapshot: () => options.board ?? boardWith() },
    autoStart: () => options.autoStart ?? true,
    start:
      options.start ??
      ((key) => {
        started.push(key)
        return Promise.resolve(OK)
      }),
    fixBug: (key) => {
      fixed.push(key)
      return Promise.resolve(OK)
    },
    logError: () => undefined,
  })
  return { reactions, notices, started, fixed }
}

async function settled(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('PollReactions', () => {
  it('says new tickets in one notice and starts each of them', async () => {
    const one = makeTicket('MDP-1')
    const two = makeTicket('MDP-2')
    const { reactions, notices, started } = harness({ board: boardWith({ new: byKey(one, two) }) })
    await reactions.react({ ...NOTHING, newTickets: [one, two] })
    await settled()
    expect(notices.map((notice) => notice.event)).toEqual([
      { type: 'newTickets', keys: ['MDP-1', 'MDP-2'] },
    ])
    expect(notices[0]).toMatchObject({ topic: 'jira', target: { kind: 'board', key: 'MDP-1' } })
    expect(started).toEqual(['MDP-1', 'MDP-2'])
  })

  it('gives a QC bug its own notice and hands it to the fix, not to Start', async () => {
    const parent = makeTicket('MDP-1')
    const bug = makeTicket('MDP-9', {
      issueType: 'Bug',
      linkedKeys: ['MDP-1'],
      summary: 'It breaks',
    })
    const plain = makeTicket('MDP-2')
    const { reactions, notices, started, fixed } = harness({
      board: boardWith({ inProgress: byKey(parent), new: byKey(bug, plain) }),
    })
    await reactions.react({ ...NOTHING, newTickets: [bug, plain] })
    await settled()
    expect(notices.map((notice) => notice.event)).toEqual([
      { type: 'newTickets', keys: ['MDP-2'] },
      { type: 'qcBugLogged', key: 'MDP-9', parentKey: 'MDP-1', summary: 'It breaks' },
    ])
    expect(fixed).toEqual(['MDP-9'])
    expect(started).toEqual(['MDP-2'])
  })

  it('only tells when auto start is off', async () => {
    const one = makeTicket('MDP-1')
    const { reactions, notices, started } = harness({
      board: boardWith({ new: byKey(one) }),
      autoStart: false,
    })
    await reactions.react({ ...NOTHING, newTickets: [one] })
    await settled()
    expect(notices).toHaveLength(1)
    expect(started).toEqual([])
  })

  it('says a failed start and goes on with the next ticket', async () => {
    const one = makeTicket('MDP-1')
    const two = makeTicket('MDP-2')
    const tried: string[] = []
    const { reactions, notices } = harness({
      board: boardWith({ new: byKey(one, two) }),
      start: (key) => {
        tried.push(key)
        return Promise.resolve(
          key === 'MDP-1' ? { ok: false, error: { code: 'worktreeFailed' } } : OK,
        )
      },
    })
    await reactions.react({ ...NOTHING, newTickets: [one, two] })
    await settled()
    expect(tried).toEqual(['MDP-1', 'MDP-2'])
    expect(notices.at(-1)).toMatchObject({
      tone: 'error',
      event: { type: 'autoStartFailed', key: 'MDP-1', code: 'worktreeFailed' },
    })
  })

  it('says finished and reopened tickets and starts nothing for them', async () => {
    const { reactions, notices, started } = harness()
    await reactions.react({
      newTickets: [],
      finished: [makeTicket('MDP-3')],
      reopened: [makeTicket('MDP-4')],
    })
    await settled()
    expect(notices.map((notice) => notice.event)).toEqual([
      { type: 'ticketsDone', keys: ['MDP-3'] },
      { type: 'ticketsReopened', keys: ['MDP-4'] },
    ])
    expect(started).toEqual([])
  })

  it('does nothing for a poll that changed nothing', async () => {
    const { reactions, notices, started } = harness()
    await reactions.react(NOTHING)
    await settled()
    expect(notices).toEqual([])
    expect(started).toEqual([])
  })

  it('starts the tickets of a later poll only after the earlier ones finished', async () => {
    const gate = deferred<typeof OK>()
    const order: string[] = []
    const one = makeTicket('MDP-1')
    const two = makeTicket('MDP-2')
    const { reactions } = harness({
      board: boardWith({ new: byKey(one, two) }),
      start: async (key) => {
        order.push(`begin ${key}`)
        if (key === 'MDP-1') {
          await gate.promise
        }
        order.push(`end ${key}`)
        return OK
      },
    })
    await reactions.react({ ...NOTHING, newTickets: [one] })
    await reactions.react({ ...NOTHING, newTickets: [two] })
    await settled()
    expect(order).toEqual(['begin MDP-1'])
    gate.resolve(OK)
    await settled()
    expect(order).toEqual(['begin MDP-1', 'end MDP-1', 'begin MDP-2', 'end MDP-2'])
  })
})
