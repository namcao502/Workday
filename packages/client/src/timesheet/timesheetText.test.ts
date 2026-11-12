import type { WeekReviewItem } from '@workday/core'
import { afterEach, expect, it } from 'vitest'
import { setLanguage } from '../i18n.js'
import { dayHeader, formatMinutes, issueText, queueStatusText } from './timesheetText.js'

afterEach(() => {
  setLanguage('en')
})

function item(overrides: Partial<WeekReviewItem>): WeekReviewItem {
  return {
    date: '2026-11-10',
    ticketKey: 'MDP-6798',
    summary: null,
    issue: 'notMine',
    suggestedKey: null,
    ...overrides,
  }
}

it('timesheetText gives the Vietnamese issue text with the suggestion', () => {
  setLanguage('vi')
  expect(issueText(item({ suggestedKey: 'MDP-6789' }))).toBe(
    'không phải ticket của anh, có phải MDP-6789?',
  )
  expect(issueText(item({ issue: 'tscOnly' }))).toBe('có ở TSC nhưng không có ở HRM')
  expect(issueText(item({ issue: 'hrmOnly' }))).toBe('có ở HRM nhưng không có ở TSC')
  expect(issueText(item({ issue: 'notFound' }))).toBe('không có ticket này trên Jira')
})

it('timesheetText gives the English issue text', () => {
  expect(issueText(item({ suggestedKey: 'MDP-6789' }))).toBe('not yours, did you mean MDP-6789?')
})

it('formats minutes as hours and minutes', () => {
  expect(formatMinutes(150)).toBe('2h 30m')
  expect(formatMinutes(480)).toBe('8h')
  expect(formatMinutes(30)).toBe('30m')
  expect(formatMinutes(0)).toBe('0h')
})

it('headers a day as MON 3 in English and T2 03/11 in Vietnamese', () => {
  expect(dayHeader('2026-11-02', 'en')).toBe('MON 2')
  expect(dayHeader('2026-11-03', 'vi')).toBe('T3 03/11')
  expect(dayHeader('2026-11-08', 'vi')).toBe('CN 08/11')
})

it('words the queue state with the countdown', () => {
  expect(queueStatusText('waiting', 135, '18:00', null)).toBe('Auto-logs at 6:00 PM (2h 15m left)')
  expect(queueStatusText('due', 0, '18:00', null)).toBe('Past the auto-log time, not logged yet')
})
