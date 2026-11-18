import { afterEach, expect, it } from 'vitest'
import { openNoticeTarget } from './noticeTarget.js'

afterEach(() => {
  window.location.hash = ''
})

it('an auto-log notice opens the timesheet, on a phone too', () => {
  openNoticeTarget({ kind: 'timesheet' }, false)
  expect(window.location.hash).toBe('#/timesheet')
  window.location.hash = ''
  openNoticeTarget({ kind: 'timesheet' }, true)
  expect(window.location.hash).toBe('#/timesheet')
})

it('a Jira ticket-update notice asks for the comparison instead of leaving the page', () => {
  const opened: string[] = []
  const listen = (event: Event): void => {
    if (event instanceof CustomEvent && typeof event.detail === 'string') {
      opened.push(event.detail)
    }
  }
  window.addEventListener('workday:ticket-update', listen)
  window.location.hash = '#/timesheet'
  openNoticeTarget({ kind: 'ticketUpdate', key: 'MDP-7' }, false)
  window.removeEventListener('workday:ticket-update', listen)
  expect(opened).toEqual(['MDP-7'])
  expect(window.location.hash).toBe('#/timesheet')
})
