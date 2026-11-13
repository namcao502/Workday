import { describe, expect, it } from 'vitest'
import {
  addTicket,
  applyAssignedPoll,
  applyLiveTickets,
  dismiss,
  markDone,
  offPollKeys,
  reopen,
  restore,
  startTicket,
  type BoardSection,
  type BoardState,
} from './board.js'
import type { StatusFlow } from './statusFlow.js'
import type { Ticket } from './ticket.js'
import { makeTicket } from './testing/ticketFixture.js'

const mdpFlow: StatusFlow = {
  preWorkStatuses: ['Backlog', 'Selected for Development', 'In Progress', 'Hold'],
  reworkStatuses: ['In Progress', 'QA Failed', 'Reopened'],
}

function byKey(...tickets: Ticket[]): Record<string, Ticket> {
  return Object.fromEntries(tickets.map((ticket) => [ticket.key, ticket]))
}

function boardWith(parts: Partial<BoardState> = {}): BoardState {
  return {
    new: {},
    inProgress: {},
    done: {},
    dismissed: {},
    seenKeys: [],
    ...parts,
  }
}

function boardWithSection(section: BoardSection, ticket: Ticket): BoardState {
  return boardWith({ [section]: byKey(ticket) })
}

const sections: BoardSection[] = ['new', 'inProgress', 'done']

describe('applyAssignedPoll', () => {
  it('adds a new ticket to new when a seen baseline exists', () => {
    const state = boardWith({ seenKeys: ['MDP-1'] })
    const assigned = byKey(makeTicket('MDP-1'), makeTicket('MDP-2'))

    const next = applyAssignedPoll(state, assigned, mdpFlow)

    expect(Object.keys(next.new)).toEqual(['MDP-2'])
    expect(next.seenKeys).toEqual(['MDP-1', 'MDP-2'])
  })

  it('records a baseline only on the first run', () => {
    const state = boardWith({ seenKeys: null })

    const next = applyAssignedPoll(state, byKey(makeTicket('MDP-1')), mdpFlow)

    expect(next.new).toEqual({})
    expect(next.seenKeys).toEqual(['MDP-1'])
  })

  it('skips a key already on the board', () => {
    const ticket = makeTicket('MDP-1')
    const state = boardWith({ inProgress: byKey(ticket), seenKeys: [] })

    const next = applyAssignedPoll(state, byKey(ticket), mdpFlow)

    expect(next.new).toEqual({})
    expect(next.seenKeys).toEqual(['MDP-1'])
  })

  it('does not add a key that is done or dismissed', () => {
    const doneTicket = makeTicket('MDP-1', { statusCategory: 'done' })
    const dismissedTicket = makeTicket('MDP-2')
    const state = boardWith({
      done: byKey(doneTicket),
      dismissed: { 'MDP-2': { ticket: dismissedTicket, origin: 'new' } },
      seenKeys: [],
    })

    const next = applyAssignedPoll(state, byKey(doneTicket, dismissedTicket), mdpFlow)

    expect(next.new).toEqual({})
  })

  it('moves a done ticket back to inProgress when Jira sends it back from QA', () => {
    const stored = makeTicket('MDP-1', { status: 'Ready to Test' })
    const live = makeTicket('MDP-1', { status: 'QA Failed' })
    const state = boardWith({ done: byKey(stored), seenKeys: ['MDP-1'] })

    const next = applyAssignedPoll(state, byKey(live), mdpFlow)

    expect(next.done).toEqual({})
    expect(next.inProgress['MDP-1']).toEqual(live)
  })

  it('keeps a done ticket when Jira did not move it back', () => {
    const state = boardWith({
      done: byKey(
        makeTicket('MDP-1', { status: 'In Progress' }),
        makeTicket('MDP-2', { status: 'PR & Code Review' }),
      ),
      seenKeys: ['MDP-1', 'MDP-2'],
    })
    const assigned = byKey(
      makeTicket('MDP-1', { status: 'In Progress' }),
      makeTicket('MDP-2', { status: 'Ready to Test' }),
    )

    const next = applyAssignedPoll(state, assigned, mdpFlow)

    expect(Object.keys(next.done).sort()).toEqual(['MDP-1', 'MDP-2'])
    expect(next.done['MDP-2']?.status).toBe('Ready to Test')
    expect(next.inProgress).toEqual({})
  })

  it.each(sections)('replaces the stored ticket in %s when Jira details changed', (section) => {
    const stored = makeTicket('MDP-1')
    const live = makeTicket('MDP-1', { dueDate: '2026-10-15', eta: '2026-10-14', devPriority: 2 })
    const state = { ...boardWithSection(section, stored), seenKeys: ['MDP-1'] }

    const next = applyAssignedPoll(state, byKey(live), mdpFlow)

    expect(next[section]['MDP-1']).toEqual(live)
  })

  it('replaces the ticket inside dismissed and keeps its origin', () => {
    const stored = makeTicket('MDP-1')
    const live = makeTicket('MDP-1', { summary: 'Renamed' })
    const state = boardWith({
      dismissed: { 'MDP-1': { ticket: stored, origin: 'inProgress' } },
      seenKeys: ['MDP-1'],
    })

    const next = applyAssignedPoll(state, byKey(live), mdpFlow)

    expect(next.dismissed['MDP-1']).toEqual({ ticket: live, origin: 'inProgress' })
  })

  it('keeps a ticket missing from the assigned result', () => {
    const ticket = makeTicket('MDP-1')
    const state = boardWith({ inProgress: byKey(ticket), seenKeys: ['MDP-1'] })

    const next = applyAssignedPoll(state, {}, mdpFlow)

    expect(next.inProgress['MDP-1']).toEqual(ticket)
  })

  it('does not mutate the input state', () => {
    const state = boardWith({ seenKeys: ['MDP-1'] })
    const snapshot = structuredClone(state)

    applyAssignedPoll(state, byKey(makeTicket('MDP-2')), mdpFlow)

    expect(state).toEqual(snapshot)
  })

  it('a poll that changes nothing returns the same state object', () => {
    const ticket = makeTicket('MDP-1')
    const state = boardWith({ new: byKey(ticket), seenKeys: ['MDP-1'] })

    const first = applyAssignedPoll(state, byKey(makeTicket('MDP-1')), mdpFlow)
    const second = applyAssignedPoll(first, byKey(makeTicket('MDP-1')), mdpFlow)

    expect(first).toBe(state)
    expect(second).toBe(state)
  })
})

describe('offPollKeys', () => {
  it('lists new and inProgress keys that left the assigned result', () => {
    const state = boardWith({
      new: byKey(makeTicket('MDP-1')),
      inProgress: byKey(makeTicket('MDP-2'), makeTicket('MDP-3')),
    })

    expect(offPollKeys(state, byKey(makeTicket('MDP-3')))).toEqual(['MDP-1', 'MDP-2'])
  })

  it('skips tickets already done in Jira and done-list tickets', () => {
    const state = boardWith({
      new: byKey(makeTicket('MDP-1', { statusCategory: 'done' })),
      inProgress: byKey(makeTicket('MDP-2', { statusCategory: 'done' })),
      done: byKey(makeTicket('MDP-3')),
    })

    expect(offPollKeys(state, {})).toEqual([])
  })

  it('does not repeat a key present in two lists', () => {
    const ticket = makeTicket('MDP-1')
    const state = boardWith({ new: byKey(ticket), inProgress: byKey(ticket) })

    expect(offPollKeys(state, {})).toEqual(['MDP-1'])
  })
})

describe('applyLiveTickets', () => {
  it('refreshes a new ticket that is absent from assigned', () => {
    const state = boardWith({ new: byKey(makeTicket('MDP-1')) })
    const live = makeTicket('MDP-1', { summary: 'Renamed' })

    const next = applyLiveTickets(state, byKey(live))

    expect(next.new['MDP-1']).toEqual(live)
  })

  it('moves a new ticket Jira finished to done', () => {
    const state = boardWith({ new: byKey(makeTicket('MDP-1', { statusCategory: 'new' })) })
    const live = makeTicket('MDP-1', { statusCategory: 'done' })

    const next = applyLiveTickets(state, byKey(live))

    expect(next.new).toEqual({})
    expect(next.done['MDP-1']).toEqual(live)
  })

  it('moves an inProgress ticket Jira finished to done', () => {
    const state = boardWith({ inProgress: byKey(makeTicket('MDP-1')) })
    const live = makeTicket('MDP-1', { statusCategory: 'done' })

    const next = applyLiveTickets(state, byKey(live))

    expect(next.inProgress).toEqual({})
    expect(next.done['MDP-1']).toEqual(live)
  })

  it('judges against the current state, not the poll start', () => {
    const ticket = makeTicket('MDP-1')
    const stateAtPollStart = boardWith({ inProgress: byKey(ticket) })
    const stateNow = dismiss(stateAtPollStart, 'MDP-1')
    const live = makeTicket('MDP-1', { statusCategory: 'done' })

    const next = applyLiveTickets(stateNow, byKey(live))

    expect(next.done).toEqual({})
    expect(next.inProgress).toEqual({})
    expect(next.dismissed['MDP-1']).toEqual({ ticket: live, origin: 'inProgress' })
  })

  it('leaves a done ticket alone apart from detail updates', () => {
    const state = boardWith({ done: byKey(makeTicket('MDP-1', { statusCategory: 'done' })) })
    const live = makeTicket('MDP-1', { statusCategory: 'done', summary: 'Renamed' })

    const next = applyLiveTickets(state, byKey(live))

    expect(next.done['MDP-1']).toEqual(live)
  })

  it('returns the same state object when nothing changed', () => {
    const ticket = makeTicket('MDP-1')
    const state = boardWith({ new: byKey(ticket) })

    expect(applyLiveTickets(state, byKey(makeTicket('MDP-1')))).toBe(state)
    expect(applyLiveTickets(state, {})).toBe(state)
  })
})

describe('addTicket', () => {
  it('puts the ticket in new and in seenKeys when it is not on the board', () => {
    const state = boardWith({ seenKeys: ['MDP-9'] })

    const next = addTicket(state, makeTicket('MDP-1'))

    expect(next?.new['MDP-1']).toEqual(makeTicket('MDP-1'))
    expect(next?.seenKeys).toEqual(['MDP-9', 'MDP-1'])
  })

  it('does not write seenKeys when no baseline exists', () => {
    const next = addTicket(boardWith({ seenKeys: null }), makeTicket('MDP-1'))

    expect(next?.new['MDP-1']).toBeDefined()
    expect(next?.seenKeys).toBeNull()
  })

  it.each(sections)('returns null when the ticket is already in %s', (section) => {
    const ticket = makeTicket('MDP-1')

    expect(addTicket(boardWithSection(section, ticket), ticket)).toBeNull()
  })

  it('returns null when the ticket is dismissed', () => {
    const ticket = makeTicket('MDP-1')
    const state = boardWith({ dismissed: { 'MDP-1': { ticket, origin: 'new' } } })

    expect(addTicket(state, ticket)).toBeNull()
  })
})

describe('markDone and reopen', () => {
  it('markDone moves a new ticket to done', () => {
    const ticket = makeTicket('MDP-1')

    const next = markDone(boardWithSection('new', ticket), 'MDP-1')

    expect(next.new).toEqual({})
    expect(next.done['MDP-1']).toEqual(ticket)
  })

  it('markDone moves an inProgress ticket to done', () => {
    const ticket = makeTicket('MDP-1')

    const next = markDone(boardWithSection('inProgress', ticket), 'MDP-1')

    expect(next.inProgress).toEqual({})
    expect(next.done['MDP-1']).toEqual(ticket)
  })

  it('markDone returns the same state when the key is not new or inProgress', () => {
    const state = boardWithSection('done', makeTicket('MDP-1'))

    expect(markDone(state, 'MDP-1')).toBe(state)
    expect(markDone(state, 'MDP-404')).toBe(state)
  })

  it('reopen moves a done ticket to inProgress', () => {
    const ticket = makeTicket('MDP-1')

    const next = reopen(boardWithSection('done', ticket), 'MDP-1')

    expect(next.done).toEqual({})
    expect(next.inProgress['MDP-1']).toEqual(ticket)
  })

  it('reopen returns the same state when the ticket is not done', () => {
    const state = boardWithSection('new', makeTicket('MDP-1'))

    expect(reopen(state, 'MDP-1')).toBe(state)
  })
})

describe('dismiss and restore', () => {
  it.each(sections)('returns a ticket dismissed from %s to the same list', (section) => {
    const ticket = makeTicket('MDP-1')
    const state = boardWithSection(section, ticket)

    const dismissed = dismiss(state, 'MDP-1')
    const restored = restore(dismissed, 'MDP-1')

    expect(dismissed[section]).toEqual({})
    expect(dismissed.dismissed['MDP-1']).toEqual({ ticket, origin: section })
    expect(restored[section]['MDP-1']).toEqual(ticket)
    expect(restored.dismissed).toEqual({})
  })

  it('dismiss keeps the key in seenKeys so a poll does not re-add it', () => {
    const state = { ...boardWithSection('new', makeTicket('MDP-1')), seenKeys: ['MDP-1'] }

    const next = dismiss(state, 'MDP-1')

    expect(next.seenKeys).toEqual(['MDP-1'])
    expect(applyAssignedPoll(next, byKey(makeTicket('MDP-1')), mdpFlow).new).toEqual({})
  })

  it('dismiss and restore return the same state for an unknown key', () => {
    const state = boardWithSection('new', makeTicket('MDP-1'))

    expect(dismiss(state, 'MDP-404')).toBe(state)
    expect(restore(state, 'MDP-1')).toBe(state)
  })
})

describe('startTicket', () => {
  it('moves a ticket from new to inProgress', () => {
    const ticket = makeTicket('MDP-1')
    const next = startTicket(boardWithSection('new', ticket), 'MDP-1')
    expect(next.new).toEqual({})
    expect(next.inProgress).toEqual(byKey(ticket))
  })

  it('returns the same object for a ticket already in progress, done, or unknown', () => {
    const inProgress = boardWithSection('inProgress', makeTicket('MDP-1'))
    const done = boardWithSection('done', makeTicket('MDP-2'))
    expect(startTicket(inProgress, 'MDP-1')).toBe(inProgress)
    expect(startTicket(done, 'MDP-2')).toBe(done)
    expect(startTicket(inProgress, 'MDP-404')).toBe(inProgress)
  })
})
