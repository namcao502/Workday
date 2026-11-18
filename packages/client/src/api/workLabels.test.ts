import { afterEach, expect, it } from 'vitest'
import { setLanguage } from '../i18n.js'
import { actionLabel, loadLabel } from './workLabels.js'

afterEach(() => {
  setLanguage('en')
})

it('names an action from its URL, with the ticket key when the URL holds one', () => {
  expect(actionLabel('/api/board/check')).toBe('Checking Jira for ticket changes')
  expect(actionLabel('/api/workspace/start/MDP-12')).toBe('Creating the MDP-12 worktree')
  expect(actionLabel('/api/teams/MDP-12/reply')).toBe('Sending the MDP-12 reply to Teams')
  expect(actionLabel('/api/timesheet/week')).toBe("Reading the week's logs")
  expect(actionLabel('/api/workspace/sessions/MDP-12~2/prompt')).toBe('Sending to Claude')
})

it('ignores the query string and falls back to a plain name', () => {
  expect(actionLabel('/api/insights?kind=thisWeek')).toBe('Reading the report')
  expect(actionLabel('/api/something/new')).toBe('Working...')
})

it('names a first load from its query key', () => {
  expect(loadLabel(['board'])).toBe('Loading the tickets')
  expect(loadLabel(['teams', 'MDP-12', 'c1'])).toBe('Reading Teams for MDP-12')
  expect(loadLabel(['unknown'])).toBe('Loading...')
})

it('speaks Vietnamese when the app does', () => {
  setLanguage('vi')
  expect(actionLabel('/api/workspace/start/MDP-12')).toBe('Đang tạo worktree MDP-12')
  expect(loadLabel(['board'])).toBe('Đang tải danh sách ticket')
})
