import { render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { Shell } from './Shell.js'
import { jsonResponse, renderWithQuery, stubFetch, stubMatchMedia } from '../testSupport.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

it('the sidebar shows the five pages and marks the current one', () => {
  stubMatchMedia(false)
  render(<Shell page="timesheet" />)
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
  render(<Shell page="insights" />)
  expect(screen.getByText('Coming soon')).toBeInTheDocument()
})
