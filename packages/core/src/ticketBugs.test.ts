import { expect, it } from 'vitest'
import { makeTicket } from './testing/ticketFixture.js'
import { isBug, parentOf } from './ticketBugs.js'

const bug = makeTicket('MDP-9323', { issueType: 'Defect', linkedKeys: ['MDP-1', 'MDP-2', 'MDP-3'] })

it('parentOf prefers in progress over done', () => {
  expect(parentOf(bug, new Set(['MDP-3']), new Set(['MDP-1']))).toBe('MDP-3')
  expect(parentOf(bug, new Set(), new Set(['MDP-2', 'MDP-3']))).toBe('MDP-2')
})

it('parentOf ignores New and Dismissed parents and non-bugs', () => {
  expect(parentOf(bug, new Set(), new Set())).toBeNull()
  const story = makeTicket('MDP-5', { issueType: 'Story', linkedKeys: ['MDP-1'] })
  expect(parentOf(story, new Set(['MDP-1']), new Set())).toBeNull()
})

it('isBug accepts Defect and Bug, ignoring case', () => {
  expect(isBug(makeTicket('A-1', { issueType: 'defect' }))).toBe(true)
  expect(isBug(makeTicket('A-1', { issueType: 'BUG' }))).toBe(true)
  expect(isBug(makeTicket('A-1', { issueType: 'Task' }))).toBe(false)
  expect(isBug(makeTicket('A-1'))).toBe(false)
})
