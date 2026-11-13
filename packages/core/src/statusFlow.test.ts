import { describe, expect, it } from 'vitest'
import { isSentBack, type StatusFlow } from './statusFlow.js'

const mdpFlow: StatusFlow = {
  preWorkStatuses: ['Backlog', 'Selected for Development', 'In Progress', 'Hold'],
  reworkStatuses: ['In Progress', 'QA Failed', 'Reopened'],
  readyToTestPath: [],
  developerStatuses: [],
}

describe('isSentBack', () => {
  it.each([
    ['Ready to Test', 'QA Failed', true],
    ['PR & Code Review', 'In Progress', true],
    ['Deployed to Production', 'Reopened', true],
    ['ready to test', 'qa failed', true],
    ['In Progress', 'In Progress', false],
    ['Selected for Development', 'In Progress', false],
    ['PR & Code Review', 'Ready to Test', false],
    [null, 'QA Failed', false],
    ['', 'QA Failed', false],
    ['Ready to Test', null, false],
  ])('stored %j, live %j gives %s', (storedStatus, liveStatus, expected) => {
    expect(isSentBack(storedStatus, liveStatus, mdpFlow)).toBe(expected)
  })
})
