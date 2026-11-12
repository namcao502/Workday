import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { Shell } from './Shell.js'
import { connectedSettings, queued, timesheetView } from '../timesheet/timesheetTestSupport.js'
import { jsonResponse, renderWithQuery, stubFetch, stubMatchMedia } from '../testSupport.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

it('the sidebar shows the five pages and marks the current one', () => {
  stubMatchMedia(false)
  stubFetch(() => jsonResponse({}, 500))
  renderWithQuery(<Shell page="timesheet" />)
  const sidebar = screen.getByRole('navigation', { name: 'Pages' })
  const names = within(sidebar)
    .getAllByRole('button')
    .map((button) => button.textContent)
  expect(names).toEqual(['Tickets', 'Workspace', 'Timesheet', 'Insights', 'Settings'])
  expect(within(sidebar).getByRole('button', { name: 'Timesheet' })).toHaveAttribute(
    'aria-current',
    'page',
  )
  expect(within(sidebar).getByRole('button', { name: 'Tickets' })).not.toHaveAttribute(
    'aria-current',
  )
})

it('below 720px the tab bar replaces the sidebar', () => {
  stubMatchMedia(true)
  stubFetch(() => jsonResponse({}, 500))
  renderWithQuery(<Shell page="tickets" />)
  expect(screen.getByRole('navigation', { name: 'Tabs' })).toBeInTheDocument()
  expect(screen.queryByRole('navigation', { name: 'Pages' })).not.toBeInTheDocument()
})

it('an unbuilt page shows Coming soon', () => {
  stubMatchMedia(false)
  stubFetch(() => jsonResponse({}, 500))
  renderWithQuery(<Shell page="insights" />)
  expect(screen.getByText('Coming soon')).toBeInTheDocument()
})

it('the Timesheet item shows a dot when a queued day is past its run', async () => {
  stubMatchMedia(false)
  const view = timesheetView({ queue: [queued('2026-11-11')] })
  stubFetch((url) => jsonResponse(url === '/api/timesheet' ? view : connectedSettings()))
  renderWithQuery(<Shell page="insights" />)
  const item = screen.getByRole('button', { name: 'Timesheet' })
  await waitFor(() => {
    expect(item.querySelector('.nav-dot')).not.toBeNull()
  })
})
