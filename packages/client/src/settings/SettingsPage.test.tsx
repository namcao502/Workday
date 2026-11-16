import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { jsonResponse, renderWithQuery, settingsView, stubFetch } from '../testSupport.js'
import { SettingsPage } from './SettingsPage.js'
import { searchEntries, settingsGroupFromHash, settingsGroups } from './settingsGroups.js'

afterEach(() => {
  cleanup()
  window.location.hash = ''
  vi.unstubAllGlobals()
})

it('shows one group at a time and switches with the group buttons', async () => {
  stubFetch(() => jsonResponse(settingsView()))
  renderWithQuery(<SettingsPage />)
  expect(await screen.findByRole('heading', { level: 2, name: 'General' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { level: 2, name: 'Connections' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Integrations' }))
  expect(await screen.findByRole('heading', { level: 2, name: 'Connections' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { level: 2, name: 'General' })).not.toBeInTheDocument()
})

it('the search box lists matching sections from every group', async () => {
  stubFetch(() => jsonResponse(settingsView()))
  renderWithQuery(<SettingsPage />)
  await screen.findByRole('heading', { level: 2, name: 'General' })
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search settings' }), {
    target: { value: 'jql' },
  })
  expect(await screen.findByRole('heading', { level: 2, name: 'Connections' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { level: 2, name: 'General' })).not.toBeInTheDocument()
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search settings' }), {
    target: { value: 'zzzz' },
  })
  expect(screen.getByRole('status')).toHaveTextContent('No settings match')
})

it('searchEntries needs every word and returns nothing for a blank query', () => {
  const groups = settingsGroups()
  expect(searchEntries(groups, '  ')).toEqual([])
  expect(searchEntries(groups, 'jira token').map((entry) => entry.id)).toEqual(['connections'])
  expect(searchEntries(groups, 'jira zzzz')).toEqual([])
})

it('the group comes from the second hash segment', () => {
  expect(settingsGroupFromHash('#/settings/work')).toBe('work')
  expect(settingsGroupFromHash('#/settings')).toBe('general')
  expect(settingsGroupFromHash('#/settings/nope')).toBe('general')
})

it('the guide is a group of its own', async () => {
  stubFetch(() => jsonResponse(settingsView()))
  renderWithQuery(<SettingsPage />)
  await screen.findByRole('heading', { level: 2, name: 'General' })
  expect(screen.queryByRole('heading', { level: 2, name: 'Guide' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Guide' }))
  expect(await screen.findByRole('heading', { level: 2, name: 'Guide' })).toBeInTheDocument()
})
