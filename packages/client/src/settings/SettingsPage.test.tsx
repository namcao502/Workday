import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import {
  jsonResponse,
  remoteDevice,
  renderRemote,
  renderWithQuery,
  settingsView,
  stubFetch,
} from '../testSupport.js'
import { SettingsPage } from './SettingsPage.js'
import { searchEntries, settingsGroups, settingsLocation } from './settingsGroups.js'

const VPN = {
  enabled: false,
  address: '10.0.0.5',
  httpsPort: 8443,
  setupPort: 8444,
  allowedRanges: ['10.0.0.0/16'],
}

afterEach(() => {
  cleanup()
  window.location.hash = ''
  vi.unstubAllGlobals()
})

function onPhone(): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('max-width'),
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }))
}

it('shows one entry at a time and switches with the menu', async () => {
  stubFetch(() => jsonResponse(settingsView()))
  renderWithQuery(<SettingsPage />)
  expect(await screen.findByRole('heading', { level: 2, name: 'Appearance' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { level: 2, name: 'Notices' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /^Jira/ }))
  expect(await screen.findByRole('heading', { level: 2, name: 'Jira' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { level: 2, name: 'Appearance' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: /^Jira/ })).toHaveAttribute('aria-current', 'page')
  expect(screen.getByText('Integrations / Jira')).toBeInTheDocument()
})

it('the menu shows which connections are set up', async () => {
  const view = settingsView()
  stubFetch(() =>
    jsonResponse(
      settingsView({
        config: { ...view.config, vpn: { ...VPN, enabled: true } },
      }),
    ),
  )
  renderWithQuery(<SettingsPage />)
  await screen.findByRole('heading', { level: 2, name: 'Appearance' })
  const vpn = screen.getByRole('button', { name: /^VPN access/ })
  expect(within(vpn).getByRole('img', { name: 'Set up and on' })).toBeInTheDocument()
  const jira = screen.getByRole('button', { name: /^Jira/ })
  expect(within(jira).getByRole('img', { name: 'Not set up or off' })).toBeInTheDocument()
  const holidays = screen.getByRole('button', { name: 'Public holidays' })
  expect(within(holidays).queryByRole('img')).toBeNull()
})

it('the search box lists matching sections from every group', async () => {
  stubFetch(() => jsonResponse(settingsView()))
  renderWithQuery(<SettingsPage />)
  await screen.findByRole('heading', { level: 2, name: 'Appearance' })
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search settings' }), {
    target: { value: 'jql' },
  })
  expect(await screen.findByRole('heading', { level: 2, name: 'Jira' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { level: 2, name: 'Appearance' })).not.toBeInTheDocument()
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search settings' }), {
    target: { value: 'zzzz' },
  })
  expect(screen.getByRole('status')).toHaveTextContent('No settings match')
})

it('searchEntries needs every word and returns nothing for a blank query', () => {
  const groups = settingsGroups()
  expect(searchEntries(groups, '  ')).toEqual([])
  expect(searchEntries(groups, 'jira token').map((entry) => entry.id)).toEqual(['jira'])
  expect(searchEntries(groups, 'jira zzzz')).toEqual([])
})

it('the hash names an entry, or a group for its first entry', () => {
  const groups = settingsGroups()
  const at = (hash: string): [string, boolean] => {
    const location = settingsLocation(groups, hash)
    return [location.entry.id, location.picked]
  }
  expect(at('#/settings/jira')).toEqual(['jira', true])
  expect(at('#/settings/work')).toEqual(['timesheet', true])
  expect(at('#/settings')).toEqual(['appearance', false])
  expect(at('#/settings/nope')).toEqual(['appearance', false])
})

it('a phone shows the menu first, then one entry with a way back', async () => {
  onPhone()
  window.location.hash = '#/settings'
  stubFetch(() => jsonResponse(settingsView()))
  renderWithQuery(<SettingsPage />)
  fireEvent.click(await screen.findByRole('button', { name: /^Jira/ }))
  expect(await screen.findByRole('heading', { level: 2, name: 'Jira' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Public holidays' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'All settings' }))
  expect(await screen.findByRole('button', { name: 'Public holidays' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { level: 2, name: 'Jira' })).toBeNull()
})

it('the guide has its own entry', async () => {
  stubFetch(() => jsonResponse(settingsView()))
  renderWithQuery(<SettingsPage />)
  await screen.findByRole('heading', { level: 2, name: 'Appearance' })
  expect(screen.queryByRole('heading', { level: 2, name: 'Guide' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Guide' }))
  expect(await screen.findByRole('heading', { level: 2, name: 'Guide' })).toBeInTheDocument()
})

it('remote settings shows the full settings page with this device', async () => {
  window.location.hash = '#/settings/remote'
  stubFetch((url) =>
    jsonResponse(url === '/api/me' ? { mode: 'remote', device: remoteDevice() } : settingsView()),
  )
  renderRemote(<SettingsPage />)
  expect(await screen.findByRole('heading', { level: 2, name: 'Device' })).toBeInTheDocument()
  expect(await screen.findByText('iPhone')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Appearance' })).toBeInTheDocument()
  expect(settingsGroups(true)[3]?.entries[0]?.id).toBe('thisDevice')
})

it('local settings hides this device', async () => {
  window.location.hash = '#/settings/remote'
  stubFetch(() => jsonResponse(settingsView()))
  renderWithQuery(<SettingsPage />)
  expect(await screen.findByRole('heading', { level: 2, name: 'VPN access' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { level: 2, name: 'Device' })).not.toBeInTheDocument()
  expect(
    settingsGroups()
      .flatMap((group) => group.entries)
      .some((entry) => entry.id === 'thisDevice'),
  ).toBe(false)
})
