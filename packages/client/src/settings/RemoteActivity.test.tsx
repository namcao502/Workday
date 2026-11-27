import { render, screen, within } from '@testing-library/react'
import type { ActivityEntry } from '@workday/core'
import { afterEach, expect, it, vi } from 'vitest'
import { stubMatchMedia } from '../testSupport.js'
import { RemoteActivity } from './RemoteActivity.js'

const ENTRY: ActivityEntry = {
  at: '2026-11-27T03:00:00Z',
  deviceId: 'd1',
  deviceName: 'Pixel',
  method: 'POST',
  route: '/api/workspace/MDP-9998/sessions/MDP-9998~1/prompt',
  status: 500,
}

afterEach(() => {
  vi.unstubAllGlobals()
})

it('on a phone each activity entry is a wrapping two-line item, not a four-column table', () => {
  stubMatchMedia(true)
  render(<RemoteActivity activity={[ENTRY]} language="en" timeZone="UTC" />)
  expect(screen.queryByRole('table')).toBeNull()
  const list = screen.getByTestId('remote-activity')
  expect(within(list).getByText(`POST ${ENTRY.route}`)).toHaveClass('wrap-anywhere')
  expect(within(list).getByText('500')).toHaveClass('text-danger')
  expect(within(list).getByText(/Pixel/)).toBeInTheDocument()
})

it('on a PC the activity stays a table', () => {
  stubMatchMedia(false)
  render(<RemoteActivity activity={[ENTRY]} language="en" timeZone="UTC" />)
  expect(screen.getByRole('table')).toBeInTheDocument()
})
