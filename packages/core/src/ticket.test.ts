import { describe, expect, it } from 'vitest'
import { devPriorityLevel, dueUrgency, isStatusDone, ticketEquals } from './ticket.js'
import { makeTicket } from './testing/ticketFixture.js'

describe('isStatusDone', () => {
  it.each([
    ['indeterminate', false],
    ['new', false],
    [null, false],
    ['DONE', true],
    ['done', true],
  ])('follows the Jira status category %s', (statusCategory, expected) => {
    expect(isStatusDone(makeTicket('MDP-1', { statusCategory }))).toBe(expected)
  })
})

describe('dueUrgency', () => {
  const today = '2026-09-29'

  it.each([
    ['2026-09-28', 'overdue'],
    ['2026-09-29', 'dueSoon'],
    ['2026-10-01', 'dueSoon'],
    ['2026-10-02', 'none'],
    [null, 'none'],
    ['not-a-date', 'none'],
  ])('compares due date %s with today', (dueDate, expected) => {
    const ticket = makeTicket('MDP-1', {
      dueDate,
      status: 'In Progress',
      statusCategory: 'indeterminate',
    })
    expect(dueUrgency(ticket, today)).toBe(expected)
  })

  it('is none when Jira already finished the ticket', () => {
    const ticket = makeTicket('MDP-1', { dueDate: '2026-09-01', statusCategory: 'done' })
    expect(dueUrgency(ticket, today)).toBe('none')
  })

  it('counts days across a month boundary', () => {
    const ticket = makeTicket('MDP-1', { dueDate: '2026-10-02' })
    expect(dueUrgency(ticket, '2026-09-30')).toBe('dueSoon')
  })
})

describe('devPriorityLevel', () => {
  it.each([
    [null, 'none'],
    [1, 'top'],
    [0.5, 'top'],
    [2, 'high'],
    [3, 'normal'],
  ])('maps priority %s to %s', (priority, expected) => {
    expect(devPriorityLevel(priority)).toBe(expected)
  })
})

describe('ticketEquals', () => {
  it('is true for two tickets with the same fields', () => {
    expect(ticketEquals(makeTicket('MDP-1'), makeTicket('MDP-1'))).toBe(true)
  })

  it('detects a changed status', () => {
    const before = makeTicket('MDP-1', { status: 'In Progress' })
    const after = makeTicket('MDP-1', { status: 'QA Failed' })
    expect(ticketEquals(before, after)).toBe(false)
  })

  it('detects a changed updated time', () => {
    const before = makeTicket('MDP-1', { updated: '2026-09-29T01:00:00.000+0000' })
    const after = makeTicket('MDP-1', { updated: '2026-09-29T02:00:00.000+0000' })
    expect(ticketEquals(before, after)).toBe(false)
  })
})
