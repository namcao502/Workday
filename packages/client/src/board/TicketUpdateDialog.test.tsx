import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import type { TicketContent } from '@workday/core'
import { afterEach, expect, it, vi } from 'vitest'
import { jsonResponse, renderWithQuery, sentJson, stubFetch } from '../testSupport.js'
import { connectedSettings } from '../timesheet/timesheetTestSupport.js'
import { openTicketUpdate, TicketUpdateHost } from './TicketUpdateHost.js'
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
  return stubFetch((url, init) => {
    if (init?.method === 'POST') {
      return jsonResponse({ ok: true })
    }
    return url === '/api/settings' ? jsonResponse(connectedSettings()) : jsonResponse({ update })
  })
}

// The text of a field's Before or After cell, whatever spans the diff split it into.
function cell(field: string, side: 'Before' | 'After'): HTMLElement {
  const row = screen.getByText(field).closest('li')
  const label = row === null ? null : within(row).getByText(side)
  const value = label?.nextElementSibling
  if (!(value instanceof HTMLElement)) {
    throw new Error(`no ${side} cell for ${field}`)
  }
  return value
}

it('TicketUpdateDialog lists only the changed fields with old and new values', async () => {
  stubUpdate(UPDATE)
  renderWithQuery(<TicketUpdateDialog ticketKey="MDP-1" canAct onClose={vi.fn()} />)
  await screen.findByText('Title')
  expect(cell('Title', 'Before')).toHaveTextContent('Old title')
  expect(cell('Title', 'After')).toHaveTextContent('New title')
  expect(cell('Due', 'Before')).toHaveTextContent('2026-11-20')
  expect(cell('Due', 'After')).toHaveTextContent('2026-11-25')
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

it('TicketUpdateDialog marks the removed words on the left and the added ones on the right', async () => {
  stubUpdate(UPDATE)
  renderWithQuery(<TicketUpdateDialog ticketKey="MDP-1" canAct onClose={vi.fn()} />)
  await screen.findByText('Title')
  const removed = cell('Title', 'Before').querySelectorAll('[data-diff="removed"]')
  const added = cell('Title', 'After').querySelectorAll('[data-diff="added"]')
  expect([...removed].map((part) => part.textContent)).toEqual(['Old'])
  expect([...added].map((part) => part.textContent)).toEqual(['New'])
  // The new attachment line is the only addition there.
  const attachments = cell('Attachments', 'After').querySelectorAll('[data-diff="added"]')
  expect([...attachments].map((part) => part.textContent?.trim())).toEqual(['b.png'])
})

it('TicketUpdateDialog links the ticket in Jira', async () => {
  stubUpdate(UPDATE)
  renderWithQuery(<TicketUpdateDialog ticketKey="MDP-1" canAct onClose={vi.fn()} />)
  expect(await screen.findByRole('link', { name: 'Open in Jira' })).toHaveAttribute(
    'href',
    'https://example.atlassian.net/browse/MDP-1',
  )
})

it('a ticket-update notice opens the comparison over whatever page is showing', async () => {
  stubUpdate(UPDATE)
  renderWithQuery(<TicketUpdateHost />)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  act(() => {
    openTicketUpdate('MDP-1')
  })
  expect(await screen.findByRole('dialog', { name: 'MDP-1 changes' })).toBeInTheDocument()
  // The footer button; the corner X is named Close too.
  const footerClose = screen.getAllByRole('button', { name: 'Close' }).at(-1)
  if (footerClose === undefined) {
    throw new Error('no Close button')
  }
  fireEvent.click(footerClose)
  await waitFor(() => {
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
