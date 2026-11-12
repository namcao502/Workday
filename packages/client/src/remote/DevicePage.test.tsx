import { screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { jsonResponse, remoteDevice, renderWithQuery, stubFetch } from '../testSupport.js'
import { DevicePage } from './DevicePage.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

const RIGHTS = { board: 'view', timesheet: 'act' } as const

it('the device page offers Add to Home Screen when push is not available', async () => {
  vi.stubGlobal('PushManager', undefined)
  stubFetch(() => jsonResponse({ mode: 'remote', device: remoteDevice(RIGHTS) }))
  renderWithQuery(<DevicePage />)
  expect(
    await screen.findByText('Add Workday to the Home Screen first to get notifications'),
  ).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Turn on notifications' })).not.toBeInTheDocument()
  expect(screen.getByText('iPhone')).toBeInTheDocument()
})

it('shows Turn off and Send test once push is on', async () => {
  vi.stubGlobal('PushManager', {})
  stubFetch(() =>
    jsonResponse({
      mode: 'remote',
      device: remoteDevice(RIGHTS, { pushEnabled: true, hasPushSubscription: true }),
    }),
  )
  renderWithQuery(<DevicePage />)
  expect(await screen.findByRole('button', { name: 'Turn off' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Send test' })).toBeInTheDocument()
})

it('offers Turn on notifications when push is available and off', async () => {
  vi.stubGlobal('PushManager', {})
  stubFetch(() => jsonResponse({ mode: 'remote', device: remoteDevice(RIGHTS) }))
  renderWithQuery(<DevicePage />)
  expect(await screen.findByRole('button', { name: 'Turn on notifications' })).toBeInTheDocument()
})
