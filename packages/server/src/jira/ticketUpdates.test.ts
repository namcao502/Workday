import type {
  BoardState,
  ServerEvent,
  TicketContent,
  TicketFieldIds,
  TicketUpdate,
} from '@workday/core'
import { describe, expect, it } from 'vitest'
import type { NoticeInput } from '../notices/noticeService.js'
import { boardWith, deferred, FakeTracker, makeTicket } from '../testing/fakes.js'
import { TicketUpdateService } from './ticketUpdates.js'

const FIELD_IDS: TicketFieldIds = { eta: 'customfield_1', devPriority: 'customfield_2' }
const UPDATED_1 = '2026-11-16T10:00:00.000+0700'
const UPDATED_2 = '2026-11-16T11:00:00.000+0700'

const CONTENT: TicketContent = {
  summary: 'Title',
  description: 'Body',
  attachments: '',
  dueDate: null,
  eta: null,
  devPriority: null,
}

function stored(overrides: Partial<TicketUpdate> = {}): TicketUpdate {
  return {
    viewed: CONTENT,
    current: CONTENT,
    updated: UPDATED_1,
    changedBy: null,
    changedAt: null,
    ...overrides,
  }
}

function harness(initial: Readonly<Record<string, TicketUpdate>>, board: BoardState) {
  const tracker = new FakeTracker()
  const saves: Record<string, TicketUpdate>[] = []
  const events: ServerEvent[] = []
  const notices: NoticeInput[] = []
  const readAt: string[] = []
  const errors: string[] = []
  const service = new TicketUpdateService({
    initial,
    save: (updates) => {
      saves.push({ ...updates })
      return Promise.resolve()
    },
    events: { broadcast: (event) => events.push(event) },
    notices: {
      add: (input) => {
        notices.push(input)
        return Promise.resolve()
      },
      markReadAt: (place) => {
        readAt.push(place)
        return Promise.resolve()
      },
    },
    board: { snapshot: () => board },
    logError: (message) => errors.push(message),
  })
  return { service, tracker, saves, events, notices, readAt, errors }
}

function watching(updated: string | null): BoardState {
  return boardWith({ inProgress: { 'MDP-1': makeTicket('MDP-1', { updated }) } })
}

describe('TicketUpdateService.check', () => {
  it('checker_skips_tickets_whose_updated_did_not_move', async () => {
    const h = harness({ 'MDP-1': stored() }, watching(UPDATED_1))
    h.tracker.contents.set('MDP-1', { ...CONTENT, summary: 'Changed' })
    let reads = 0
    h.tracker.getTicketContent = () => {
      reads += 1
      return Promise.resolve(null)
    }

    await h.service.check(h.tracker, FIELD_IDS)

    expect(reads).toBe(0)
    expect(h.saves).toEqual([])
  })

  it('checker_reads_changelog_only_when_a_field_changed', async () => {
    const h = harness({ 'MDP-1': stored() }, watching(UPDATED_2))
    let changelogReads = 0
    h.tracker.getChangeHistories = () => {
      changelogReads += 1
      return Promise.resolve([])
    }
    h.tracker.contents.set('MDP-1', CONTENT)
    await h.service.check(h.tracker, FIELD_IDS)
    expect(changelogReads).toBe(0)
    expect(h.service.view()['MDP-1']?.updated).toBe(UPDATED_2)

    const changed = harness({ 'MDP-1': stored() }, watching(UPDATED_2))
    changed.tracker.contents.set('MDP-1', { ...CONTENT, summary: 'Changed' })
    changed.tracker.getChangeHistories = () => {
      changelogReads += 1
      return Promise.resolve([])
    }
    await changed.service.check(changed.tracker, FIELD_IDS)
    expect(changelogReads).toBe(1)
  })

  it('checker_keeps_going_when_one_ticket_fails', async () => {
    const board = boardWith({
      inProgress: {
        'MDP-1': makeTicket('MDP-1', { updated: UPDATED_2 }),
        'MDP-2': makeTicket('MDP-2', { updated: UPDATED_2 }),
      },
    })
    const h = harness({}, board)
    const read = h.tracker.getTicketContent.bind(h.tracker)
    h.tracker.getTicketContent = (key) =>
      key === 'MDP-1' ? Promise.reject(new Error('boom')) : read(key)
    h.tracker.contents.set('MDP-2', CONTENT)

    await h.service.check(h.tracker, FIELD_IDS)

    expect(Object.keys(h.service.view())).toEqual(['MDP-2'])
    expect(h.errors).toHaveLength(1)
  })

  it('checker_does_not_overwrite_a_view_made_while_it_read', async () => {
    const changed = { ...CONTENT, summary: 'Changed' }
    const h = harness({ 'MDP-1': stored({ current: changed }) }, watching(UPDATED_2))
    const gate = deferred<TicketContent | null>()
    h.tracker.getTicketContent = () => gate.promise

    const checking = h.service.check(h.tracker, FIELD_IDS)
    await h.service.markViewed('MDP-1', changed)
    gate.resolve(changed)
    await checking

    expect(h.service.view()['MDP-1']?.viewed).toEqual(changed)
    expect(h.notices).toEqual([])
  })

  it('checker_raises_one_notice_per_ticket_with_a_new_change_and_none_for_my_own_edit', async () => {
    const board = boardWith({
      inProgress: {
        'MDP-1': makeTicket('MDP-1', { updated: UPDATED_2 }),
        'MDP-2': makeTicket('MDP-2', { updated: UPDATED_2 }),
      },
    })
    const h = harness({ 'MDP-1': stored(), 'MDP-2': stored() }, board)
    h.tracker.contents.set('MDP-1', { ...CONTENT, summary: 'Changed', description: 'Other' })
    h.tracker.contents.set('MDP-2', { ...CONTENT, summary: 'Mine' })
    h.tracker.getChangeHistories = (key) =>
      Promise.resolve([
        {
          created: '2026-11-16T10:30:00.000+0700',
          authorAccountId: key === 'MDP-2' ? 'acc-me' : 'acc-an',
          authorName: 'An',
          fieldIds: ['summary', 'description'],
        },
      ])

    await h.service.check(h.tracker, FIELD_IDS)

    expect(h.notices).toHaveLength(1)
    expect(h.notices[0]).toMatchObject({
      topic: 'jira',
      place: 'ticket-update:MDP-1',
      target: { kind: 'ticketUpdate', key: 'MDP-1' },
      event: {
        type: 'ticketUpdated',
        key: 'MDP-1',
        fields: ['summary', 'description'],
        changedBy: 'An',
      },
    })
    expect(h.saves).toHaveLength(1)
    expect(h.events).toContainEqual({ type: 'work.changed' })
  })

  it('drops entries of tickets that left the board', async () => {
    const h = harness({ 'MDP-9': stored() }, watching(null))
    await h.service.check(h.tracker, FIELD_IDS)
    expect(h.service.view()).toEqual({})
    expect(h.saves).toHaveLength(1)
  })
})

describe('TicketUpdateService.markViewed', () => {
  it('stores the shown content, clears the notice and broadcasts', async () => {
    const changed = { ...CONTENT, summary: 'Changed' }
    const h = harness(
      { 'MDP-1': stored({ current: changed, changedBy: 'An' }) },
      watching(UPDATED_1),
    )

    await h.service.markViewed('MDP-1', changed)

    expect(h.service.view()['MDP-1']).toMatchObject({ viewed: changed, changedBy: null })
    expect(h.readAt).toEqual(['ticket-update:MDP-1'])
    expect(h.events).toContainEqual({ type: 'work.changed' })
  })
})
