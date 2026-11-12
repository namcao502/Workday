import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import type { PairingView, RemoteConfig, RemoteDevice, RemoteStatusView } from '@workday/core'
import { afterEach, expect, it, vi } from 'vitest'
import {
  jsonResponse,
  remoteDevice,
  renderRemote,
  renderWithQuery,
  sentJson,
  settingsView,
  stubFetch,
} from '../testSupport.js'
import { RemoteSection } from './RemoteSection.js'

const CONFIG: RemoteConfig = {
  enabled: true,
  publicHost: 'workday.example.com',
  accessTeamDomain: 'myteam.cloudflareaccess.com',
  accessAud: 'aud-1',
  cloudflaredPath: null,
}

const CLOSED: PairingView = { code: null, expiresAt: null, pending: null }

function status(
  devices: readonly RemoteDevice[] = [],
  pairing: PairingView = CLOSED,
): RemoteStatusView {
  return {
    tunnel: 'running',
    tunnelDetail: null,
    devices,
    pairing,
    activity: [],
    vapidPublicKey: null,
  }
}

function configured(): ReturnType<typeof settingsView> {
  const base = settingsView()
  return { ...base, config: { ...base.config, remote: CONFIG } }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

it('Save sends the remote block and leaves out an untouched tunnel token', async () => {
  const fetchMock = stubFetch((url, init) =>
    init?.method === 'PUT' ? jsonResponse(configured()) : jsonResponse(status()),
  )
  renderWithQuery(<RemoteSection settings={configured()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/settings',
      expect.objectContaining({ method: 'PUT' }),
    )
  })
  const body = sentJson(fetchMock)
  expect(body).not.toHaveProperty('tunnelToken')
  expect(body['remote']).toEqual(CONFIG)
})

it('Pair a device shows the code and approves the waiting request', async () => {
  const open: PairingView = {
    code: 'ABC234',
    expiresAt: new Date(Date.now() + 300_000).toISOString(),
    pending: {
      name: 'My phone',
      email: 'me@example.com',
      ip: '1.2.3.4',
      at: new Date().toISOString(),
    },
  }
  let current = status()
  const fetchMock = stubFetch((url, init) => {
    if (url === '/api/remote/pairing' && init?.method === 'POST') {
      current = status([], open)
      return jsonResponse(open)
    }
    if (url === '/api/remote/pairing/approve') {
      current = status([remoteDevice({ board: 'view', timesheet: 'act' }, { name: 'My phone' })])
      return jsonResponse(current)
    }
    return jsonResponse(current)
  })
  renderWithQuery(<RemoteSection settings={configured()} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Pair a device' }))
  expect(await screen.findByText('ABC234')).toBeInTheDocument()
  expect(screen.getByText(/My phone/)).toBeInTheDocument()
  expect(screen.getByText(/1\.2\.3\.4/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/remote/pairing/approve',
      expect.objectContaining({ method: 'POST' }),
    )
  })
})

it("changing a right sends the device's new rights at once", async () => {
  const device = remoteDevice({ board: 'view', timesheet: 'act' })
  const fetchMock = stubFetch(() => jsonResponse(status([device])))
  renderWithQuery(<RemoteSection settings={configured()} />)
  const group = await screen.findByRole('radiogroup', { name: 'Tickets access' })
  fireEvent.click(within(group).getByRole('radio', { name: 'Act' }))
  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/remote/devices/d1',
      expect.objectContaining({ method: 'PUT' }),
    )
  })
  expect(sentJson(fetchMock)).toEqual({ rights: { board: 'act', timesheet: 'act' } })
})

it('Revoke asks before removing the device', async () => {
  const device = remoteDevice({ board: 'view', timesheet: 'act' })
  const fetchMock = stubFetch((url, init) =>
    init?.method === 'DELETE' ? jsonResponse(status()) : jsonResponse(status([device])),
  )
  renderWithQuery(<RemoteSection settings={configured()} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Revoke' }))
  expect(fetchMock).not.toHaveBeenCalledWith(
    '/api/remote/devices/d1',
    expect.objectContaining({ method: 'DELETE' }),
  )
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Revoke' }))
  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/remote/devices/d1',
      expect.objectContaining({ method: 'DELETE' }),
    )
  })
})

it('the remote section is not shown on a remote device', () => {
  const fetchMock = stubFetch(() => jsonResponse(status()))
  renderRemote(<RemoteSection settings={configured()} />, { board: 'act', timesheet: 'act' })
  expect(screen.queryByRole('heading', { name: 'Remote access' })).not.toBeInTheDocument()
  expect(fetchMock).not.toHaveBeenCalled()
})
