import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { TeamsOption } from '@workday/core'
import { afterEach, expect, it } from 'vitest'
import { ConversationSelect } from './TeamsPanels.js'

afterEach(() => {
  cleanup()
})

const OPTIONS: readonly TeamsOption[] = [
  { id: 'c1', label: 'MDP > PR in the hole', kind: 'channel', posted: true },
  { id: 'c2', label: 'TSC Miami > General', kind: 'channel', posted: true },
]

function renderSelect(pending: readonly string[]): void {
  render(
    <ConversationSelect
      options={OPTIONS}
      value="c1"
      pending={pending}
      onChange={() => undefined}
    />,
  )
}

it('the trigger shows a dot when another conversation has a message waiting', () => {
  renderSelect(['c2'])
  expect(screen.getByRole('img', { name: 'Unread in another conversation' })).toBeInTheDocument()
})

it('no dot when only the open conversation is pending', () => {
  renderSelect(['c1'])
  expect(
    screen.queryByRole('img', { name: 'Unread in another conversation' }),
  ).not.toBeInTheDocument()
})

it('the waiting conversation carries a dot in the list', async () => {
  renderSelect(['c2'])
  fireEvent.click(screen.getByRole('button', { name: /Conversation/ }))
  const option = await screen.findByRole('option', { name: /TSC Miami > General/ })
  expect(option.querySelector('[aria-label="Unread"]')).not.toBeNull()
  const open = screen.getByRole('option', { name: /PR in the hole/ })
  expect(open.querySelector('[aria-label="Unread"]')).toBeNull()
})
