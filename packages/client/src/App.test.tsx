import { render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { App } from './App.js'
import {
  jsonResponse,
  remoteDevice,
  settingsView,
  stubFetch,
  stubMatchMedia,
} from './testSupport.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

it('sets the theme and shows the default page once the settings load', async () => {
  stubMatchMedia(false)
  stubFetch((url) =>
    url === '/api/me'
      ? jsonResponse({ mode: 'local' })
      : jsonResponse(settingsView({ config: { ...settingsView().config, theme: 'light' } })),
  )
  render(<App socketFactory={() => ({ onmessage: null, onclose: null, close: vi.fn() })} />)
  expect(await screen.findByRole('heading', { name: 'Tickets' })).toBeInTheDocument()
  expect(document.documentElement.dataset['theme']).toBe('light')
})

it('remembers the theme so index.html can apply it before the settings load', async () => {
  localStorage.removeItem('workday.theme')
  stubMatchMedia(false)
  stubFetch((url) =>
    url === '/api/me'
      ? jsonResponse({ mode: 'local' })
      : jsonResponse(settingsView({ config: { ...settingsView().config, theme: 'light' } })),
  )
  render(<App socketFactory={() => ({ onmessage: null, onclose: null, close: vi.fn() })} />)
  expect(await screen.findByRole('heading', { name: 'Tickets' })).toBeInTheDocument()
  expect(localStorage.getItem('workday.theme')).toBe('light')
})

const RIGHTS = { board: 'view', timesheet: 'view' } as const
const noSocket = () => ({ onmessage: null, onclose: null, close: vi.fn() })

it('a 401 notPaired from any call shows the pair page', async () => {
  stubMatchMedia(false)
  stubFetch((url) =>
    url === '/api/me'
      ? jsonResponse({ mode: 'remote', device: remoteDevice(RIGHTS) })
      : jsonResponse({ ok: false, error: { code: 'notPaired' } }, 401),
  )
  render(<App socketFactory={noSocket} />)
  expect(await screen.findByRole('button', { name: 'Pair' })).toBeInTheDocument()
})

it('an unpaired device sees the pair page before the settings are asked for', async () => {
  stubMatchMedia(false)
  const fetchMock = stubFetch(() => jsonResponse({ mode: 'unpaired' }))
  render(<App socketFactory={noSocket} />)
  expect(await screen.findByRole('button', { name: 'Pair' })).toBeInTheDocument()
  expect(fetchMock.mock.calls.some(([url]) => url === '/api/settings')).toBe(false)
})

it('accessRequired shows one line instead of the app', async () => {
  stubMatchMedia(false)
  stubFetch(() => jsonResponse({ ok: false, error: { code: 'accessRequired' } }, 403))
  render(<App socketFactory={noSocket} />)
  expect(await screen.findByText('Sign in through Cloudflare Access first')).toBeInTheDocument()
})
