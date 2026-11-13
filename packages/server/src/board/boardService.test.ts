import type { BoardState, JiraConfig, ServerEvent, Ticket } from '@workday/core'
import { beforeEach, describe, expect, it } from 'vitest'
import type { EventSink } from '../events.js'
import { boardWith, deferred, FakeTracker, makeTicket } from '../testing/fakes.js'
import { BoardService } from './boardService.js'

const JIRA: JiraConfig = {
  baseUrl: 'https://jira.example',
  email: 'me@example.com',
  projectKey: 'MDP',
  assignedJql: 'assignee = currentUser()',
  mineJql: 'assignee = currentUser()',
  maxResults: 50,
  etaFieldId: null,
  devPriorityFieldId: null,
  statusFlow: {
    preWorkStatuses: [],
    reworkStatuses: [],
    readyToTestPath: [],
    developerStatuses: [],
  },
  suggestions: null,
}

class RecordingSink implements EventSink {
  readonly events: ServerEvent[] = []
  broadcast(event: ServerEvent): void {
    this.events.push(event)
  }
}

let tracker = new FakeTracker()
let sink = new RecordingSink()
let saved: BoardState[] = []
let saveFails = false
let errors: string[] = []

function createService(initialState: BoardState): BoardService {
  return new BoardService({
    initialState,
    save: (state) => {
      if (saveFails) {
        return Promise.reject(new Error('disk full'))
      }
      saved.push(state)
      return Promise.resolve()
    },
    events: sink,
    settings: { jira: JIRA, tracker, timeZone: 'Asia/Ho_Chi_Minh' },
    now: () => new Date('2026-11-12T03:00:00Z'),
    logError: (message) => {
      errors.push(message)
    },
  })
}

function keysIn(service: BoardService, section: string): string[] {
  return service
    .view()
    .rows.filter((row) => row.section === section)
    .map((row) => row.ticket.key)
}

beforeEach(() => {
  tracker = new FakeTracker()
  sink = new RecordingSink()
  saved = []
  saveFails = false
  errors = []
})

describe('BoardService poll', () => {
  it('a failing assigned query keeps the board and records the failure', async () => {
    const service = createService(boardWith({ new: { 'MDP-1': makeTicket('MDP-1') } }))
    tracker.assigned = () => Promise.reject(new Error('Jira search failed with status 500'))

    await service.poll()

    const view = service.view()
    expect(keysIn(service, 'new')).toEqual(['MDP-1'])
    expect(view.lastPoll).toEqual({
      at: '2026-11-12T03:00:00.000Z',
      ok: false,
      error: { code: 'pollFailed' },
    })
    expect(saved).toEqual([])
  })

  it('two poll requests during one poll call Jira once', async () => {
    const service = createService(boardWith())
    const assigned = deferred<Readonly<Record<string, Ticket>>>()
    tracker.assigned = () => assigned.promise

    const first = service.poll()
    const second = service.poll()
    assigned.resolve({ 'MDP-1': makeTicket('MDP-1') })
    await Promise.all([first, second])

    expect(tracker.assignedCalls).toBe(1)
    expect(keysIn(service, 'new')).toEqual(['MDP-1'])
    expect(service.view().lastPoll?.ok).toBe(true)
  })

  it("a dismiss queued during a poll is not undone by the poll's result", async () => {
    const service = createService(
      boardWith({ new: { 'MDP-1': makeTicket('MDP-1') }, seenKeys: ['MDP-1'] }),
    )
    const assigned = deferred<Readonly<Record<string, Ticket>>>()
    tracker.assigned = () => assigned.promise

    const polling = service.poll()
    await service.act('MDP-1', 'dismiss')
    assigned.resolve({ 'MDP-1': makeTicket('MDP-1', { summary: 'Renamed' }) })
    await polling

    expect(keysIn(service, 'new')).toEqual([])
    const dismissedRow = service.view().rows.find((row) => row.section === 'dismissed')
    expect(dismissedRow?.ticket.summary).toBe('Renamed')
  })
})

describe('BoardService add (port of TicketBoardTests.AddFromJiraAsync_*)', () => {
  it('add puts a ticket Jira knows on the board', async () => {
    const service = createService(boardWith())
    tracker.live.set('MDP-1', makeTicket('MDP-1'))

    expect(await service.add('mdp-1')).toEqual({ ok: true })
    expect(keysIn(service, 'new')).toEqual(['MDP-1'])
  })

  it('add rejects a key already on the board', async () => {
    const service = createService(boardWith({ inProgress: { 'MDP-1': makeTicket('MDP-1') } }))
    tracker.live.set('MDP-1', makeTicket('MDP-1'))

    const result = await service.add('1')

    expect(result).toEqual({ ok: false, error: { code: 'alreadyOnBoard', key: 'MDP-1' } })
    expect(tracker.getTicketCalls).toEqual([])
    expect(keysIn(service, 'new')).toEqual([])
  })

  it('add rejects a key Jira does not know', async () => {
    const service = createService(boardWith())

    const result = await service.add('MDP-1')

    expect(result).toEqual({ ok: false, error: { code: 'notFound', key: 'MDP-1' } })
    expect(service.view().rows).toEqual([])
  })

  it('add rejects input that holds no ticket key', async () => {
    const service = createService(boardWith())

    expect(await service.add('hello')).toEqual({ ok: false, error: { code: 'invalidKey' } })
  })
})

describe('BoardService events', () => {
  it('every board change broadcasts board.changed', async () => {
    const service = createService(boardWith())
    tracker.live.set('MDP-1', makeTicket('MDP-1'))

    await service.add('MDP-1')
    await service.act('MDP-1', 'dismiss')
    await service.act('MDP-1', 'dismiss')
    await service.act('MDP-404', 'done')

    expect(sink.events).toEqual([{ type: 'board.changed' }, { type: 'board.changed' }])
    expect(saved).toHaveLength(2)
  })
})

describe('BoardService view', () => {
  it('builds one row per ticket with its url, section and urgency', () => {
    const service = createService(
      boardWith({ done: { 'MDP-3': makeTicket('MDP-3', { dueDate: '2026-11-01' }) } }),
    )
    expect(service.view()).toEqual({
      connected: true,
      lastPoll: null,
      today: '2026-11-12',
      rows: [
        {
          ticket: makeTicket('MDP-3', { dueDate: '2026-11-01' }),
          section: 'done',
          dueUrgency: 'overdue',
          url: 'https://jira.example/browse/MDP-3',
        },
      ],
    })
  })
})

describe('BoardService review fixes', () => {
  it('a settings change during a poll drops the old result and the next poll uses the new tracker', async () => {
    const service = createService(boardWith())
    const assigned = deferred<Readonly<Record<string, Ticket>>>()
    tracker.assigned = () => assigned.promise
    const newTracker = new FakeTracker()
    newTracker.assigned = () => Promise.resolve({ 'MDP-2': makeTicket('MDP-2') })

    const oldPoll = service.poll()
    service.configure({ jira: JIRA, tracker: newTracker, timeZone: 'Asia/Ho_Chi_Minh' })
    const newPoll = service.poll()
    assigned.resolve({ 'MDP-1': makeTicket('MDP-1') })
    await Promise.all([oldPoll, newPoll])

    expect(newTracker.assignedCalls).toBe(1)
    expect(keysIn(service, 'new')).toEqual(['MDP-2'])
  })

  it('a failing save leaves the view unchanged', async () => {
    const service = createService(boardWith({ new: { 'MDP-1': makeTicket('MDP-1') } }))
    saveFails = true

    await expect(service.act('MDP-1', 'dismiss')).rejects.toThrow('disk full')

    expect(keysIn(service, 'new')).toEqual(['MDP-1'])
    expect(sink.events).toEqual([])
  })

  it('a poll whose save fails records pollFailed instead of rejecting', async () => {
    const service = createService(boardWith())
    tracker.assigned = () => Promise.resolve({ 'MDP-1': makeTicket('MDP-1') })
    saveFails = true

    await service.poll()

    expect(service.view().rows).toEqual([])
    expect(service.view().lastPoll).toMatchObject({ ok: false, error: { code: 'pollFailed' } })
  })

  it('a poll skips a key whose lookup fails and applies the others', async () => {
    const service = createService(
      boardWith({
        inProgress: { 'MDP-2': makeTicket('MDP-2'), 'MDP-3': makeTicket('MDP-3') },
        seenKeys: ['MDP-2', 'MDP-3'],
      }),
    )
    tracker.failingKeys.add('MDP-2')
    tracker.live.set('MDP-3', makeTicket('MDP-3', { statusCategory: 'done', status: 'Done' }))

    await service.poll()

    expect(tracker.getTicketCalls).toEqual(['MDP-2', 'MDP-3'])
    expect(keysIn(service, 'inProgress')).toEqual(['MDP-2'])
    expect(keysIn(service, 'done')).toEqual(['MDP-3'])
    expect(service.view().lastPoll?.ok).toBe(true)
  })

  it('configure without a relevant change broadcasts nothing', () => {
    const service = createService(boardWith())

    service.configure({ jira: JIRA, tracker, timeZone: 'Asia/Ho_Chi_Minh' })
    service.configure({ jira: JIRA, tracker, timeZone: 'UTC' })

    expect(sink.events).toEqual([{ type: 'board.changed' }])
  })

  it('add drops a ticket fetched from a tracker that was replaced or removed meanwhile', async () => {
    const service = createService(boardWith())
    const lookup = deferred<Ticket | null>()
    tracker.getTicket = () => lookup.promise

    const replaced = service.add('MDP-1')
    service.configure({ jira: JIRA, tracker: new FakeTracker(), timeZone: 'Asia/Ho_Chi_Minh' })
    lookup.resolve(makeTicket('MDP-1'))
    expect(await replaced).toEqual({ ok: false, error: { code: 'jiraUnreachable' } })

    const current = service.view().rows
    const secondLookup = deferred<Ticket | null>()
    const secondTracker = new FakeTracker()
    secondTracker.getTicket = () => secondLookup.promise
    service.configure({ jira: JIRA, tracker: secondTracker, timeZone: 'Asia/Ho_Chi_Minh' })
    const disconnected = service.add('MDP-1')
    service.configure({ jira: JIRA, tracker: null, timeZone: 'Asia/Ho_Chi_Minh' })
    secondLookup.resolve(makeTicket('MDP-1'))
    expect(await disconnected).toEqual({ ok: false, error: { code: 'notConnected' } })
    expect(service.view().rows).toEqual(current)
    expect(current).toEqual([])
  })
})

describe('BoardService.refreshTicket', () => {
  it('updates a ticket on the board from Jira', async () => {
    const service = createService(boardWith({ inProgress: { 'MDP-1': makeTicket('MDP-1') } }))
    tracker.live.set('MDP-1', makeTicket('MDP-1', { status: 'Ready to Test' }))

    await service.refreshTicket('MDP-1')

    expect(service.snapshot().inProgress['MDP-1']?.status).toBe('Ready to Test')
    expect(saved).toHaveLength(1)
  })

  it('only logs a Jira error', async () => {
    const before = boardWith({ inProgress: { 'MDP-1': makeTicket('MDP-1') } })
    const service = createService(before)
    tracker.failingKeys.add('MDP-1')

    await service.refreshTicket('MDP-1')

    expect(service.snapshot()).toBe(before)
    expect(errors).toEqual(['Refreshing MDP-1 failed'])
  })
})
