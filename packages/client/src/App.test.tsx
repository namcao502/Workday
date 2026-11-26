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
  render(
    <App
      socketFactory={() => ({ onopen: null, onmessage: null, onclose: null, close: vi.fn() })}
    />,
  )
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
  render(
    <App
      socketFactory={() => ({ onopen: null, onmessage: null, onclose: null, close: vi.fn() })}
    />,
  )
  expect(await screen.findByRole('heading', { name: 'Tickets' })).toBeInTheDocument()
  expect(localStorage.getItem('workday.theme')).toBe('light')
})

const noSocket = () => ({ onopen: null, onmessage: null, onclose: null, close: vi.fn() })

it('a 401 notPaired from any call shows the pair page', async () => {
  stubMatchMedia(false)
  stubFetch((url) =>
    url === '/api/me'
      ? jsonResponse({ mode: 'remote', device: remoteDevice() })
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

it('the pair page is not wrapped in .legacy-page', async () => {
  stubMatchMedia(false)
  stubFetch(() => jsonResponse({ mode: 'unpaired' }))
  render(<App socketFactory={noSocket} />)
  const pair = await screen.findByRole('button', { name: 'Pair' })
  expect(pair.closest('.legacy-page')).toBeNull()
})

it('accessRequired shows one line instead of the app', async () => {
  stubMatchMedia(false)
  stubFetch(() => jsonResponse({ ok: false, error: { code: 'accessRequired' } }, 403))
  render(<App socketFactory={noSocket} />)
  expect(await screen.findByText('Sign in through Cloudflare Access first')).toBeInTheDocument()
})

it('tells the CSS how much the season may decorate, and drops it with the season', async () => {
  stubMatchMedia(false)
  const config = { ...settingsView().config, season: 'christmas', seasonEffects: 'light' } as const
  stubFetch((url) =>
    url === '/api/me' ? jsonResponse({ mode: 'local' }) : jsonResponse(settingsView({ config })),
  )
  render(<App socketFactory={noSocket} />)
  expect(await screen.findByRole('heading', { name: 'Tickets' })).toBeInTheDocument()
  expect(document.documentElement.dataset['season']).toBe('christmas')
  expect(document.documentElement.dataset['seasonEffects']).toBe('light')
})

it('puts the season cursor on the page only when the setting allows it', async () => {
  stubMatchMedia(false)
  const cursorOn = { ...settingsView().config, season: 'tet', seasonCursor: true } as const
  stubFetch((url) =>
    url === '/api/me' ? jsonResponse({ mode: 'local' }) : jsonResponse(settingsView({ config: cursorOn })),
  )
  const { unmount } = render(<App socketFactory={noSocket} />)
  expect(await screen.findByRole('heading', { name: 'Tickets' })).toBeInTheDocument()
  const root = document.documentElement
  expect(root.dataset['seasonCursor']).toBe('')
  expect(root.style.getPropertyValue('--season-cursor')).toMatch(/^url\("data:image\/svg\+xml,/)
  expect(root.style.getPropertyValue('--season-cursor-pointer')).toMatch(/, pointer$/)
  unmount()

  const cursorOff = { ...cursorOn, seasonCursor: false } as const
  stubFetch((url) =>
    url === '/api/me' ? jsonResponse({ mode: 'local' }) : jsonResponse(settingsView({ config: cursorOff })),
  )
  render(<App socketFactory={noSocket} />)
  expect(await screen.findByRole('heading', { name: 'Tickets' })).toBeInTheDocument()
  expect(root.dataset['seasonCursor']).toBeUndefined()
  expect(root.style.getPropertyValue('--season-cursor')).toBe('')
})
