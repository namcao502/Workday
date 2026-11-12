import type { BoardRow, Ticket } from '@workday/core'
import { expect, it } from 'vitest'
import { countViews, pickViewWithHits, rowsForView } from './boardView.js'

function row(key: string, section: BoardRow['section'], overrides: Partial<Ticket> = {}): BoardRow {
  return {
    ticket: {
      key,
      summary: `Summary of ${key}`,
      dueDate: null,
      eta: null,
      devPriority: null,
      status: null,
      statusCategory: null,
      issueType: null,
      timeSpentSeconds: null,
      updated: null,
      parentKey: null,
      ...overrides,
    },
    section,
    dueUrgency: 'none',
    url: `https://jira.example/browse/${key}`,
  }
}

it('boardView counts each view after the search filter', () => {
  const rows = [
    row('MDP-1', 'new'),
    row('MDP-2', 'inProgress'),
    row('MDP-3', 'done'),
    row('MDP-4', 'dismissed', { summary: 'Special case' }),
  ]
  expect(countViews(rows, '')).toEqual({ working: 2, done: 1, dismissed: 1 })
  expect(countViews(rows, 'special')).toEqual({ working: 0, done: 0, dismissed: 1 })
})

it('boardView sorts Working by due date with undated tickets last', () => {
  const rows = [
    row('MDP-5', 'new'),
    row('MDP-3', 'new', { dueDate: '2026-11-20' }),
    row('MDP-4', 'inProgress', { dueDate: '2026-11-10' }),
    row('MDP-1', 'new'),
  ]
  const keys = rowsForView(rows, 'working', '').map((boardRow) => boardRow.ticket.key)
  expect(keys).toEqual(['MDP-4', 'MDP-3', 'MDP-1', 'MDP-5'])
})

it('boardView sorts Done by updated descending, then key', () => {
  const rows = [
    row('MDP-1', 'done', { updated: '2026-11-01T00:00:00Z' }),
    row('MDP-3', 'done', { updated: '2026-11-05T00:00:00Z' }),
    row('MDP-2', 'done', { updated: '2026-11-05T00:00:00Z' }),
  ]
  const keys = rowsForView(rows, 'done', '').map((boardRow) => boardRow.ticket.key)
  expect(keys).toEqual(['MDP-2', 'MDP-3', 'MDP-1'])
})

it('pickViewWithHits keeps a view that has hits and otherwise moves to one that does', () => {
  expect(pickViewWithHits({ working: 1, done: 2, dismissed: 0 }, 'done')).toBe('done')
  expect(pickViewWithHits({ working: 0, done: 2, dismissed: 1 }, 'working')).toBe('done')
  expect(pickViewWithHits({ working: 0, done: 0, dismissed: 0 }, 'working')).toBe('working')
})
