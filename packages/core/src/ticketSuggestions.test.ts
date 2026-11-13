import { describe, expect, it } from 'vitest'
import {
  pickMonthEpic,
  rankSuggestions,
  suggestionNotice,
  type EpicTicket,
  type Suggestion,
} from './ticketSuggestions.js'

const today = '2026-10-20'
const prefix = 'MDP Issues - '
const options = { selectedStatus: 'Selected for Development', stopWords: ['mdp'] }

function epic(key: string, summary: string, overrides: Partial<EpicTicket> = {}): EpicTicket {
  return {
    key,
    summary,
    status: 'Backlog',
    issueType: 'Task',
    priority: 'Medium',
    devPriority: null,
    dueDate: null,
    ...overrides,
  }
}

function rank(candidates: readonly EpicTicket[], mine: readonly EpicTicket[] = [], excluded: string[] = []) {
  return rankSuggestions(candidates, mine, new Set(excluded), today, options)
}

function suggestion(ticket: EpicTicket, urgent: boolean): Suggestion {
  return { ticket, score: 0, similarKey: null, urgent }
}

describe('pickMonthEpic', () => {
  const october = epic('MDP-9170', 'MDP Issues - October 2026')
  const september = epic('MDP-8809', 'MDP Issues - September 2026')
  const november = epic('MDP-9400', 'MDP Issues - November 2026')
  const backlog = epic('MDP-7947', 'MDP Issues - 2026 - Backlog')

  it('falls back to last month and never picks a future month', () => {
    expect(pickMonthEpic([november, backlog, september, october], today, prefix)?.key).toBe('MDP-9170')
    expect(pickMonthEpic([backlog, september], today, prefix)?.key).toBe('MDP-8809')
    expect(pickMonthEpic([november, backlog], today, prefix)).toBeNull()
  })

  it('reads a month case-insensitively and trims', () => {
    expect(pickMonthEpic([epic('MDP-1', '  mdp issues - september 2026 ')], today, prefix)?.key).toBe('MDP-1')
  })

  it.each(['MDP Issues - Octember 2026', 'Something else'])('ignores %j', (summary) => {
    expect(pickMonthEpic([epic('MDP-1', summary)], today, prefix)).toBeNull()
  })

  it('skips a key that is not a Jira key', () => {
    expect(pickMonthEpic([epic('MDP-1 OR project = X', 'MDP Issues - October 2026')], today, prefix)).toBeNull()
  })
})

describe('rankSuggestions', () => {
  it('skips placeholders and keys already on the board', () => {
    const candidates = [
      epic('MDP-9362', 'Consolidate Columbus carts to a single list'),
      epic('MDP-9361', 'Royalty report shows $0 for a license', {
        dueDate: '2026-10-21',
        priority: 'High',
        devPriority: 3,
      }),
      epic('MDP-9334', 'Copy OTS reporting tables to the BI database', { dueDate: '2026-10-19' }),
      epic('MDP-9326', "Add permitted SKUs with 'All Colors' fails for partners", {
        dueDate: '2026-10-19',
        priority: 'High',
        issueType: 'Bug',
      }),
      epic('MDP-9272', "Placeholder: show a 'By Box' view", { dueDate: '2026-10-19', priority: 'High' }),
      epic('MDP-9311', 'Add new pretreat options to Polaris PMPD config screens', { dueDate: '2026-10-20' }),
    ]
    const mine = [epic('MDP-9310', 'Permitted SKU UI change requests')]

    const ranked = rank(candidates, mine, ['MDP-9311'])

    expect(ranked.map((s) => s.ticket.key)).toEqual(['MDP-9326', 'MDP-9361', 'MDP-9334', 'MDP-9362'])
    expect(ranked[0]?.similarKey).toBe('MDP-9310')
    expect(ranked[1]?.similarKey).toBeNull()
  })

  it('breaks a tie by the earlier due date, then keeps the input order', () => {
    const ranked = rank([
      epic('MDP-3', 'Some work', { dueDate: '2026-10-22' }),
      epic('MDP-2', 'Some work', { dueDate: '2026-10-21' }),
      epic('MDP-1', 'Some work', { dueDate: '2026-10-22' }),
    ])
    expect(ranked.map((s) => s.ticket.key)).toEqual(['MDP-2', 'MDP-3', 'MDP-1'])
  })

  it('counts Selected for Development and a top dev priority', () => {
    const ranked = rank([
      epic('MDP-1', 'Some work'),
      epic('MDP-2', 'Some work', { status: 'Selected for Development' }),
      epic('MDP-3', 'Some work', { devPriority: 0 }),
    ])
    expect(ranked.map((s) => s.ticket.key)).toEqual(['MDP-3', 'MDP-2', 'MDP-1'])
  })

  it('needs two shared words, ignoring common ones, plurals and the project key', () => {
    const mine = [
      epic('MDP-1', 'Add new columns to the export'),
      epic('MDP-2', 'Permitted SKU UI change requests'),
    ]
    const similar = (summary: string, own = mine) => rank([epic('MDP-9', summary)], own)[0]?.similarKey
    expect(similar('Export permitted SKUs with weights')).toBe('MDP-2')
    expect(similar('Add new update for the export')).toBeNull()
    expect(similar('New pretreat options in the PMPD config', [epic('MDP-8246', 'Add a partner config option to control ASNs')])).toBeNull()
  })

  it('marks urgent: high priority, due within two days or overdue, not a stale date', () => {
    const urgent = (overrides: Partial<EpicTicket>) => rank([epic('MDP-1', 'x', overrides)])[0]?.urgent
    expect(urgent({ priority: 'High' })).toBe(true)
    expect(urgent({ dueDate: '2026-10-18' })).toBe(true)
    expect(urgent({ dueDate: '2026-10-22' })).toBe(true)
    expect(urgent({ dueDate: '2026-10-23' })).toBe(false)
    expect(urgent({})).toBe(false)
    expect(urgent({ dueDate: '2026-04-27' })).toBe(false)
  })

  it('gives a stale due date no points', () => {
    const ranked = rank([
      epic('MDP-7259', 'Confirm Atlas', { dueDate: '2026-04-27' }),
      epic('MDP-9319', 'Change Fanatics', { dueDate: '2026-10-28' }),
    ])
    expect(ranked.map((s) => s.ticket.key)).toEqual(['MDP-9319', 'MDP-7259'])
    expect(ranked[1]?.score).toBe(0)
  })
})

describe('suggestionNotice', () => {
  const one = suggestion(epic('MDP-1', 'x'), true)
  const two = suggestion(epic('MDP-2', 'x'), false)
  const three = suggestion(epic('MDP-3', 'x'), true)
  const four = suggestion(epic('MDP-4', 'x'), true)

  it('records on the first check, then notifies new urgent tickets once a day', () => {
    const baseline = suggestionNotice([one, two], [], null, false, today)
    expect(baseline).toEqual({ noticeKeys: [], notifiedKeys: ['MDP-1'] })

    const next = suggestionNotice([one, two, three], baseline.notifiedKeys, null, true, today)
    expect(next.noticeKeys).toEqual(['MDP-3'])
    expect([...next.notifiedKeys].sort()).toEqual(['MDP-1', 'MDP-3'])

    const sameDay = suggestionNotice([one, two, three, four], next.notifiedKeys, today, true, today)
    expect(sameDay.noticeKeys).toEqual([])
    expect(sameDay.notifiedKeys).not.toContain('MDP-4')

    const later = suggestionNotice([four], sameDay.notifiedKeys, today, true, '2026-10-21')
    expect(later).toEqual({ noticeKeys: ['MDP-4'], notifiedKeys: ['MDP-4'] })
  })
})
