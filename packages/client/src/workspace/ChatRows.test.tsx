import { fireEvent, render, screen } from '@testing-library/react'
import type { ChatMessage } from '@workday/core'
import { expect, it } from 'vitest'
import { ChatRows } from './ChatRows.js'

function message(role: ChatMessage['role'], text: string, isError = false, id = 1): ChatMessage {
  return {
    id,
    role,
    text,
    toolName: null,
    toolDetail: null,
    isError,
    at: null,
    uuid: null,
    status: null,
    output: null,
    edit: null,
    todos: null,
  }
}

it('wraps a long unbroken prompt inside its bubble', () => {
  render(<ChatRows messages={[message('user', 'C:\\a\\very\\long\\path\\file.md')]} />)
  expect(screen.getByText('C:\\a\\very\\long\\path\\file.md')).toHaveClass('wrap-anywhere')
})

it('shows the interrupt marker as a translated status line', () => {
  render(<ChatRows messages={[message('notice', '[Request interrupted by user]')]} />)
  expect(screen.getByText('Stopped by you')).toBeInTheDocument()
  expect(screen.queryByText('[Request interrupted by user]')).toBeNull()
})

it('turns an expired sign-in error into an alert with the fix', () => {
  const error = 'Failed to authenticate. API Error: 401 OAuth access token has expired.'
  render(<ChatRows messages={[message('notice', error, true)]} />)
  expect(screen.getByText('Claude sign-in expired')).toBeInTheDocument()
  expect(screen.getByText(/type \/login/)).toBeInTheDocument()
})

it('keeps any other error as a plain red line', () => {
  render(<ChatRows messages={[message('notice', 'API Error: 529 overloaded', true)]} />)
  expect(screen.queryByText('Claude sign-in expired')).toBeNull()
  expect(screen.getByText('API Error: 529 overloaded')).toHaveClass('text-danger')
})

it('folds an automatic Teams analysis turn into one line that opens on demand', () => {
  const prompt =
    'Read C:\\Users\\me\\AppData\\Roaming\\Workday\\tmp\\teams-tasks\\MDP-1-analysis-20261126-071032-980.md and do the analysis it asks for.'
  const answer = [
    '```json',
    '{"request": "r1", "issues": [{"text": "A", "status": "open"}, {"text": "B", "status": "fixed"}], "diagnosis": "d", "nextStep": "n", "replies": []}',
    '```',
  ].join('\n')
  render(
    <ChatRows
      messages={[
        message('user', prompt, false, 1),
        message('tool', 'Read', false, 2),
        message('assistant', answer, false, 3),
        message('user', 'thanks', false, 4),
      ]}
    />,
  )
  expect(screen.getByText(prompt)).not.toBeVisible()
  const fold = screen.getByRole('button', { name: /Teams analysis: 2 issue\(s\), 1 open/ })
  expect(screen.getByText('thanks')).toBeInTheDocument()
  fireEvent.click(fold)
  expect(screen.getByText(prompt)).toBeVisible()
})

it('folds back-to-back analysis turns into one line with their count', () => {
  const prompt = (stamp: string): string =>
    `Read C:/data/tmp/teams-tasks/MDP-1-analysis-${stamp}.md and do the analysis it asks for.`
  render(
    <ChatRows
      messages={[
        message('user', prompt('1'), false, 1),
        message('assistant', 'one', false, 2),
        message('user', prompt('2'), false, 3),
        message('assistant', 'two', false, 4),
        message('user', prompt('3'), false, 5),
        message('assistant', 'three', false, 6),
        message('user', 'mine', false, 7),
      ]}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: /3 Teams analyses/ }))
  expect(screen.getAllByRole('button', { name: /^Teams analysis/ })).toHaveLength(3)
  expect(screen.getByText('mine')).toBeInTheDocument()
})
