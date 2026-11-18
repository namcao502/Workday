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
