import { fireEvent, screen, waitFor } from '@testing-library/react'
import type { TeamsAnalysisView } from '@workday/core'
import { afterEach, expect, it, vi } from 'vitest'
import { jsonResponse, renderWithQuery, stubFetch } from '../../testSupport.js'
import { TeamsAnalysisPanel } from './TeamsAnalysisPanel.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

const DONE: TeamsAnalysisView = {
  kind: 'done',
  stale: true,
  analysis: {
    issues: [
      { text: 'Column is wrong', status: 'open' },
      { text: 'Typo', status: 'fixed' },
    ],
    diagnosis: 'The SP misses a join',
    nextStep: 'Fix the join',
    replies: ['da e fix r a', 'e check lai nha a'],
  },
}

function renderPanel(onUseReply = vi.fn()) {
  renderWithQuery(
    <TeamsAnalysisPanel
      ticket="MDP-1"
      conversationId="c1"
      lastMessageId="m9"
      session="MDP-1"
      waitingLine="QC is waiting since 3:05 PM"
      onUseReply={onUseReply}
    />,
  )
  return onUseReply
}

it('shows the summary, stale note and waiting line, details on demand, and loads a reply', async () => {
  stubFetch(() => jsonResponse(DONE))
  const onUseReply = renderPanel()
  expect(await screen.findByText(/Claude: 2 issue\(s\), 1 open/)).toBeInTheDocument()
  expect(screen.getByText(/New messages since this analysis/)).toBeInTheDocument()
  expect(screen.getByText(/QC is waiting since 3:05 PM/)).toBeInTheDocument()
  expect(screen.getByText('The SP misses a join')).toBeInTheDocument()
  expect(screen.getByText('Column is wrong')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Collapse' }))
  expect(screen.queryByText('The SP misses a join')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'da e fix r a' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Expand' }))
  fireEvent.click(screen.getByRole('button', { name: 'da e fix r a' }))
  expect(onUseReply).toHaveBeenCalledWith('da e fix r a')
})

it('Analyze sends the main point and the session, and says why a start was refused', async () => {
  const fetchMock = stubFetch((url, init) => {
    if (init?.method === 'POST') {
      return jsonResponse({ ok: false, error: { code: 'claudeNotRunning' } })
    }
    return jsonResponse({ kind: 'none' } satisfies TeamsAnalysisView)
  })
  renderPanel()
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'fixed already' } })
  fireEvent.click(screen.getByRole('button', { name: 'Analyze again' }))
  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledWith('/api/teams/MDP-1/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId: 'c1', mainPoint: 'fixed already', session: 'MDP-1' }),
    })
  })
  expect(await screen.findByRole('alert')).toBeInTheDocument()
})

it('asks for the status with the session, so the server can hand a new message to a free Claude', async () => {
  const fetchMock = stubFetch(() => jsonResponse({ kind: 'running' } satisfies TeamsAnalysisView))
  renderPanel()
  await waitFor(() => {
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      '/api/teams/MDP-1/analysis?conversation=c1&last=m9&session=MDP-1',
    )
  })
})
