import { fireEvent, screen, waitFor } from '@testing-library/react'
import type { TicketContent } from '@workday/core'
import { afterEach, expect, it, vi } from 'vitest'
import { jsonResponse, renderWithQuery, sentJson, stubFetch } from '../testSupport.js'
import { TicketUpdateDialog } from './TicketUpdateDialog.js'

const VIEWED: TicketContent = {
  summary: 'Old title',
  description: 'Same text',
  attachments: 'a.png',
  dueDate: '2026-11-20',
  eta: null,
  devPriority: 2,
}
const CURRENT: TicketContent = {
  ...VIEWED,
  summary: 'New title',
  attachments: 'a.png\nb.png',
  dueDate: '2026-11-25',
}
const UPDATE = {
  fields: ['summary', 'attachments', 'dueDate'],
  viewed: VIEWED,
  current: CURRENT,
  changedBy: 'Minh',
  changedAt: '2026-11-15T08:00:00Z',
}

afterEach(() => {
  vi.unstubAllGlobals()
})

function stubUpdate(update: unknown) {
  return stubFetch((url, init) =>
    init?.method === 'POST' ? jsonResponse({ ok: true }) : jsonResponse({ update }),
  )
}

it('TicketUpdateDialog lists only the changed fields with old and new values', async () => {
  stubUpdate(UPDATE)
  renderWithQuery(<TicketUpdateDialog ticketKey="MDP-1" canAct onClose={vi.fn()} />)
  expect(await screen.findByText('Old title')).toBeInTheDocument()
  expect(screen.getByText('New title')).toBeInTheDocument()
  expect(screen.getByText('2026-11-20')).toBeInTheDocument()
  expect(screen.getByText('2026-11-25')).toBeInTheDocument()
  expect(screen.getByText(/Minh/)).toBeInTheDocument()
  expect(screen.queryByText('Same text')).not.toBeInTheDocument()
  expect(screen.queryByText('ETA')).not.toBeInTheDocument()
})

it('TicketUpdateDialog Mark as seen posts the current content', async () => {
  const fetchMock = stubUpdate(UPDATE)
  const onClose = vi.fn()
  renderWithQuery(<TicketUpdateDialog ticketKey="MDP-1" canAct onClose={onClose} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Mark as seen' }))
  await waitFor(() => {
    expect(onClose).toHaveBeenCalled()
  })
  expect(fetchMock).toHaveBeenCalledWith(
    '/api/tickets/MDP-1/update/viewed',
    expect.objectContaining({ method: 'POST' }),
  )
  expect(sentJson(fetchMock)).toEqual({ shown: CURRENT })
})

it('TicketUpdateDialog says nothing changed when no update is pending', async () => {
  stubUpdate(null)
  renderWithQuery(<TicketUpdateDialog ticketKey="MDP-1" canAct onClose={vi.fn()} />)
  expect(await screen.findByText('Nothing changed')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Mark as seen' })).not.toBeInTheDocument()
})
