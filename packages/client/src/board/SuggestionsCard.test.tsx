import { fireEvent, screen, waitFor } from '@testing-library/react'
import type { WorkView } from '@workday/core'
import { afterEach, expect, it, vi } from 'vitest'
import { jsonResponse, renderWithQuery, stubFetch } from '../testSupport.js'
import { SuggestionsCard } from './SuggestionsCard.js'
import { suggestion } from './workTestSupport.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

type Suggestions = NonNullable<WorkView['suggestions']>

function suggestions(count: number): Suggestions {
  const items = Array.from({ length: count }, (_, index) => suggestion(`MDP-${String(index + 1)}`))
  return { epicKey: 'MDP-100', items }
}

it('suggestions card shows ten and Show more adds ten', () => {
  stubFetch(() => jsonResponse({}, 500))
  renderWithQuery(
    <SuggestionsCard suggestions={suggestions(25)} today="2026-11-12" language="en" />,
  )
  expect(screen.getAllByText(/^Summary of/)).toHaveLength(10)
  fireEvent.click(screen.getByRole('button', { name: 'Show 10 more (15 left)' }))
  expect(screen.getAllByText(/^Summary of/)).toHaveLength(20)
})

it('take shows the holder when someone else has the ticket', async () => {
  const fetchMock = stubFetch((url) =>
    url.endsWith('/take')
      ? jsonResponse({ ok: false, holder: 'Linh' })
      : jsonResponse({ ok: true }),
  )
  renderWithQuery(<SuggestionsCard suggestions={suggestions(1)} today="2026-11-12" language="en" />)
  fireEvent.click(screen.getByRole('button', { name: 'Take' }))
  fireEvent.click(screen.getAllByRole('button', { name: 'Take' })[0] as HTMLElement)
  expect(await screen.findByText('Linh already took MDP-1')).toBeInTheDocument()
  expect(fetchMock).toHaveBeenCalledWith('/api/work/suggestions/MDP-1/take', { method: 'POST' })
  await waitFor(() => {
    expect(screen.queryByText('Take MDP-1?')).not.toBeInTheDocument()
  })
})
