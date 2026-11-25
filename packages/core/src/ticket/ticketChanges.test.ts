import { describe, expect, it } from 'vitest'
import {
  applyRead,
  changedFields,
  fieldOfId,
  keepOnly,
  markViewed,
  parseJiraTime,
  pendingFields,
  type ChangeHistory,
  type TicketContent,
  type TicketFieldIds,
  type TicketUpdate,
} from './ticketChanges.js'

const ME = 'acc-me'
const LEAD = 'acc-lead'
const FIRST_UPDATED = '2026-10-19T09:00:00.000+0700'
const SECOND_UPDATED = '2026-10-19T10:00:00.000+0700'
const IDS: TicketFieldIds = { eta: 'customfield_10735', devPriority: 'customfield_11111' }

const ORIGINAL: TicketContent = {
  summary: 'Title',
  description: 'Do it',
  attachments: 'a.png',
  dueDate: '2026-10-30',
  eta: '2026-10-28',
  devPriority: 2,
}

function history(
  accountId: string | null,
  name: string,
  time: string,
  ...fieldIds: string[]
): ChangeHistory {
  const instant = parseJiraTime(time)
  if (instant === null) {
    throw new Error(`bad time ${time}`)
  }
  return {
    created: new Date(instant).toISOString(),
    authorAccountId: accountId,
    authorName: name,
    fieldIds,
  }
}

function read(
  stored: TicketUpdate | null,
  current: TicketContent,
  updated: string,
  histories: readonly ChangeHistory[] | null,
  myAccountId: string | null = ME,
): { update: TicketUpdate; isNewChange: boolean } {
  return applyRead(stored, current, updated, histories, myAccountId, IDS)
}

const baseline = (): TicketUpdate => read(null, ORIGINAL, FIRST_UPDATED, null).update

describe('applyRead', () => {
  it('applyRead_first_read_reports_nothing', () => {
    const { update, isNewChange } = read(null, ORIGINAL, FIRST_UPDATED, null)
    expect(isNewChange).toBe(false)
    expect(update).toEqual({
      viewed: ORIGINAL,
      current: ORIGINAL,
      updated: FIRST_UPDATED,
      changedBy: null,
      changedAt: null,
    })
    expect(pendingFields(update)).toEqual([])
  })

  it('applyRead_swallows_a_change_made_only_by_me', () => {
    const current = { ...ORIGINAL, eta: '2026-10-29' }
    const histories = [history(ME, 'Nam', '2026-10-19T09:30:00.000+0700', IDS.eta ?? '')]
    const { update, isNewChange } = read(baseline(), current, SECOND_UPDATED, histories)
    expect(isNewChange).toBe(false)
    expect(update.viewed.eta).toBe('2026-10-29')
    expect(pendingFields(update)).toEqual([])
    expect(update.changedBy).toBeNull()
  })

  it('applyRead_reports_a_change_by_someone_else', () => {
    const current = { ...ORIGINAL, description: 'Do it, and the export' }
    const histories = [history(LEAD, 'Minh Dinh', '2026-10-19T09:30:00.000+0700', 'description')]
    const { update, isNewChange } = read(baseline(), current, SECOND_UPDATED, histories)
    expect(isNewChange).toBe(true)
    expect(pendingFields(update)).toEqual(['description'])
    expect(update.viewed).toEqual(ORIGINAL)
    expect(update.changedBy).toBe('Minh Dinh')
    expect(update.changedAt).toBe(histories[0]?.created)
  })

  it('applyRead_keeps_a_field_that_already_waited', () => {
    const afterLead = read(baseline(), { ...ORIGINAL, description: "Lead's" }, SECOND_UPDATED, [
      history(LEAD, 'Minh Dinh', '2026-10-19T09:30:00.000+0700', 'description'),
    ]).update
    const { update, isNewChange } = read(
      afterLead,
      { ...ORIGINAL, description: "Lead's, fixed" },
      '2026-10-19T11:00:00.000+0700',
      [history(ME, 'Nam', '2026-10-19T10:30:00.000+0700', 'description')],
    )
    expect(isNewChange).toBe(false)
    expect(pendingFields(update)).toEqual(['description'])
    expect(update.changedBy).toBe('Minh Dinh')
  })

  it('applyRead_treats_unreadable_changelog_as_others', () => {
    const { update, isNewChange } = read(
      baseline(),
      { ...ORIGINAL, summary: 'New' },
      SECOND_UPDATED,
      null,
    )
    expect(isNewChange).toBe(true)
    expect(pendingFields(update)).toEqual(['summary'])
    expect(update.changedBy).toBeNull()
  })

  it('applyRead_merges_editor_names', () => {
    const afterLead = read(baseline(), { ...ORIGINAL, summary: 'New' }, SECOND_UPDATED, [
      history(LEAD, 'Minh Dinh', '2026-10-19T09:30:00.000+0700', 'summary'),
    ]).update
    const { update, isNewChange } = read(
      afterLead,
      { ...ORIGINAL, summary: 'New', devPriority: 1 },
      '2026-10-19T11:00:00.000+0700',
      [history('acc-qc', 'QC Lan', '2026-10-19T10:30:00.000+0700', IDS.devPriority ?? '')],
    )
    expect(isNewChange).toBe(true)
    expect(update.changedBy).toBe('Minh Dinh, QC Lan')
  })

  it('applyRead_ignores_histories_up_to_the_last_read', () => {
    const histories = [history(ME, 'Nam', FIRST_UPDATED, IDS.eta ?? '')]
    const { isNewChange } = read(
      baseline(),
      { ...ORIGINAL, eta: '2026-10-29' },
      SECOND_UPDATED,
      histories,
    )
    expect(isNewChange).toBe(true)
  })

  it('applyRead_reports_my_edit_when_my_account_is_unknown', () => {
    const histories = [history(ME, 'Nam', '2026-10-19T09:30:00.000+0700', IDS.eta ?? '')]
    const { isNewChange } = read(
      baseline(),
      { ...ORIGINAL, eta: '2026-10-29' },
      SECOND_UPDATED,
      histories,
      null,
    )
    expect(isNewChange).toBe(true)
  })
})

describe('markViewed', () => {
  it('markViewed_clears_editor_when_nothing_pending', () => {
    const afterLead = read(baseline(), { ...ORIGINAL, summary: 'New' }, SECOND_UPDATED, [
      history(LEAD, 'Minh Dinh', '2026-10-19T09:30:00.000+0700', 'summary'),
    ]).update
    const viewed = markViewed(afterLead, afterLead.current)
    expect(pendingFields(viewed)).toEqual([])
    expect(viewed.changedBy).toBeNull()
    expect(viewed.changedAt).toBeNull()
    const stillPending = markViewed(afterLead, ORIGINAL)
    expect(pendingFields(stillPending)).toEqual(['summary'])
    expect(stillPending.changedBy).toBe('Minh Dinh')
  })
})

describe('helpers', () => {
  it('keepOnly_drops_tickets_off_the_board', () => {
    const map = { 'MDP-1': baseline(), 'MDP-2': baseline() }
    expect(Object.keys(keepOnly(map, new Set(['MDP-2'])))).toEqual(['MDP-2'])
  })

  it('changedFields_lists_each_differing_field', () => {
    const after: TicketContent = {
      summary: 'x',
      description: 'x',
      attachments: 'x',
      dueDate: 'x',
      eta: 'x',
      devPriority: 9,
    }
    expect(changedFields(ORIGINAL, after)).toEqual([
      'summary',
      'description',
      'attachments',
      'dueDate',
      'eta',
      'devPriority',
    ])
    expect(changedFields({ ...ORIGINAL, dueDate: null }, { ...ORIGINAL, dueDate: '' })).toEqual([])
  })

  it('fieldOfId maps the watched fields only', () => {
    expect(fieldOfId('attachment', IDS)).toBe('attachments')
    expect(fieldOfId('customfield_10735', IDS)).toBe('eta')
    expect(fieldOfId('customfield_11111', IDS)).toBe('devPriority')
    expect(fieldOfId('status', IDS)).toBeNull()
  })
})
