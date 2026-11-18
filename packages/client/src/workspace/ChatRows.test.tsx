import { render, screen } from '@testing-library/react'
import type { ChatMessage } from '@workday/core'
import { expect, it } from 'vitest'
import { ChatRows } from './ChatRows.js'

function message(role: ChatMessage['role'], text: string, isError = false): ChatMessage {
  return {
    id: 1,
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
