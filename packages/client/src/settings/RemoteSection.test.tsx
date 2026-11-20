import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import type {
  PairingView,
  RemoteConfig,
  RemoteDevice,
  RemoteStatusView,
  VpnConfig,
  VpnStatusView,
} from '@workday/core'
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
import { CloudflareSection } from './CloudflareSection.js'
import { RemoteSection } from './RemoteSection.js'
import { VpnSection } from './VpnSection.js'

const CONFIG: RemoteConfig = {
  enabled: true,
  publicHost: 'workday.example.com',
  accessTeamDomain: 'myteam.cloudflareaccess.com',
  accessAud: 'aud-1',
  cloudflaredPath: null,
}

vi.mock('qrcode', () => {
  const toDataURL = vi.fn(() => Promise.resolve('data:image/png;base64,QR'))
  return { default: { toDataURL }, toDataURL }
})

const VPN: VpnConfig = {
  enabled: true,
  address: '10.20.30.40',
  httpsPort: 8443,
  setupPort: 8444,
  allowedRanges: ['10.20.0.0/16'],
}

const CLOSED: PairingView = { code: null, expiresAt: null, pending: null }

const VPN_OFF: VpnStatusView = {
  server: 'off',
  serverDetail: null,
  addresses: [],
  httpsUrl: null,
  setupUrl: null,
  caFingerprint: null,
}

function status(
  devices: readonly RemoteDevice[] = [],
  pairing: PairingView = CLOSED,
  vpn: VpnStatusView = VPN_OFF,
): RemoteStatusView {
  return {
    tunnel: 'running',
    tunnelDetail: null,
    devices,
    pairing,
    activity: [],
    vapidPublicKey: null,
    vpn,
  }
}

function configured(): ReturnType<typeof settingsView> {
  const base = settingsView()
  return { ...base, config: { ...base.config, remote: CONFIG } }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

it('Cloudflare Save sends only the remote block and leaves out an untouched tunnel token', async () => {
  const fetchMock = stubFetch((url, init) =>
    init?.method === 'PUT' ? jsonResponse(configured()) : jsonResponse(status()),
  )
  renderWithQuery(<CloudflareSection settings={configured()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/settings',
      expect.objectContaining({ method: 'PUT' }),
    )
  })
  const body = sentJson(fetchMock)
  expect(body).not.toHaveProperty('tunnelToken')
  expect(body).not.toHaveProperty('vpn')
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
  renderRemote(
    <>
      <VpnSection settings={configured()} />
      <CloudflareSection settings={configured()} />
      <RemoteSection settings={configured()} />
    </>,
    { board: 'act', timesheet: 'act' },
  )
  expect(screen.queryByRole('heading')).not.toBeInTheDocument()
  expect(fetchMock).not.toHaveBeenCalled()
})

it('VPN and Cloudflare are separate cards, each with its own Save', () => {
  stubFetch(() => jsonResponse(status()))
  renderWithQuery(
    <>
      <VpnSection settings={withVpn()} />
      <CloudflareSection settings={withVpn()} />
    </>,
  )
  for (const name of ['VPN access', 'Cloudflare']) {
    const card = screen.getByRole('heading', { name }).closest('.card')
    expect(card).not.toBeNull()
    expect(within(card as HTMLElement).getAllByRole('button', { name: 'Save' })).toHaveLength(1)
  }
})

function withVpn(): ReturnType<typeof settingsView> {
  const base = configured()
  return { ...base, config: { ...base.config, vpn: VPN } }
}

it('VPN Save sends only the vpn block', async () => {
  const fetchMock = stubFetch((url, init) =>
    init?.method === 'PUT' ? jsonResponse(withVpn()) : jsonResponse(status()),
  )
  renderWithQuery(<VpnSection settings={withVpn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/settings',
      expect.objectContaining({ method: 'PUT' }),
    )
  })
  const body = sentJson(fetchMock)
  expect(body['vpn']).toEqual(VPN)
  expect(body).not.toHaveProperty('remote')
  expect(body).not.toHaveProperty('tunnelToken')
})

it('a bad range blocks Save and shows why', () => {
  const fetchMock = stubFetch(() => jsonResponse(status()))
  const base = withVpn()
  const bad = { ...VPN, allowedRanges: ['10.20.0.0/99'] }
  renderWithQuery(<VpnSection settings={{ ...base, config: { ...base.config, vpn: bad } }} />)
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(screen.getByRole('alert')).toHaveTextContent('10.20.0.0/99')
  expect(fetchMock).not.toHaveBeenCalledWith(
    '/api/settings',
    expect.objectContaining({ method: 'PUT' }),
  )
})

it('the firewall button reports a cancelled prompt', async () => {
  const fetchMock = stubFetch((url) =>
    url === '/api/remote/firewall'
      ? jsonResponse({ ok: false, error: { code: 'firewallCancelled' } }, 409)
      : jsonResponse(status()),
  )
  renderWithQuery(<VpnSection settings={withVpn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Open firewall' }))
  expect(await screen.findByText('Cancelled')).toBeInTheDocument()
  expect(fetchMock).toHaveBeenCalledWith(
    '/api/remote/firewall',
    expect.objectContaining({ method: 'POST' }),
  )
})

it('the pairing card shows the setup QR and link while vpn runs', async () => {
  const running: VpnStatusView = {
    ...VPN_OFF,
    server: 'running',
    httpsUrl: 'https://10.20.30.40:8443',
    setupUrl: 'http://10.20.30.40:8444/setup',
    caFingerprint: 'AB:CD',
  }
  stubFetch(() => jsonResponse(status([], CLOSED, running)))
  renderWithQuery(<RemoteSection settings={withVpn()} />)
  const image = await screen.findByAltText('http://10.20.30.40:8444/setup')
  expect(image).toHaveAttribute('src', 'data:image/png;base64,QR')
  expect(screen.getAllByText('http://10.20.30.40:8444/setup').length).not.toBe(0)
  expect(screen.getAllByText(/https:\/\/10\.20\.30\.40:8443/).length).not.toBe(0)
})
