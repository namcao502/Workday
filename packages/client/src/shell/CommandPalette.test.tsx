import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import type { WorkspaceView } from '@workday/core'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { queryKeys } from '../api/client.js'
import { boardOf, boardRow } from '../board/workTestSupport.js'
import { jsonResponse, settingsView, stubFetch, stubMatchMedia } from '../testSupport.js'
import { CommandPalette } from './CommandPalette.js'
import { setPaletteOpen } from './palette.js'
import { Shell } from './Shell.js'

const WORKSPACE: WorkspaceView = {
  configured: true,
  tabs: [{ id: 'MDP-7', kind: 'ticket', folder: null, sessions: ['MDP-7', 'MDP-7~2'] }],
  sessions: [],
  starting: [],
  recentFolders: [],
}

function renderPalette(): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  queryClient.setQueryData(
    queryKeys.board,
    boardOf([boardRow('MDP-1', 'Fix login'), boardRow('MDP-2', 'Add export')]),
  )
  queryClient.setQueryData(queryKeys.workspace, WORKSPACE)
  const base = settingsView()
  queryClient.setQueryData(
    queryKeys.settings,
    settingsView({
      config: {
        ...base.config,
        jira: {
          baseUrl: 'https://x.atlassian.net',
          email: 'a@b.c',
          projectKey: 'MDP',
          assignedJql: '',
          mineJql: '',
          maxResults: 50,
          etaFieldId: null,
          devPriorityFieldId: null,
          statusFlow: {
            preWorkStatuses: [],
            reworkStatuses: [],
            readyToTestPath: [],
            developerStatuses: [],
          },
          suggestions: null,
        },
      },
    }),
  )
  render(
    <QueryClientProvider client={queryClient}>
      <CommandPalette />
    </QueryClientProvider>,
  )
}

function pressCtrlK(): void {
  fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
}

beforeEach(() => {
  stubMatchMedia(false)
  stubFetch(() => jsonResponse({}, 500))
  window.location.hash = ''
  setPaletteOpen(false)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

it('ctrl k opens the palette and esc closes it', async () => {
  renderPalette()
  expect(screen.queryByRole('combobox')).toBeNull()
  pressCtrlK()
  const input = await screen.findByRole('combobox')
  expect(input).toHaveFocus()
  fireEvent.keyDown(input, { key: 'Escape' })
  await vi.waitFor(() => {
    expect(screen.queryByRole('combobox')).toBeNull()
  })
})

it('typing filters pages and enter navigates', async () => {
  renderPalette()
  pressCtrlK()
  const input = await screen.findByRole('combobox')
  fireEvent.change(input, { target: { value: 'time' } })
  expect(screen.getAllByRole('option')).toHaveLength(1)
  fireEvent.keyDown(input, { key: 'Enter' })
  expect(window.location.hash).toBe('#/timesheet')
})

it('tickets from the board cache open in the workspace', async () => {
  renderPalette()
  pressCtrlK()
  const input = await screen.findByRole('combobox')
  fireEvent.change(input, { target: { value: 'export' } })
  const option = screen.getByRole('option', { name: /MDP-2/ })
  expect(option).toHaveTextContent('Add export')
  fireEvent.keyDown(input, { key: 'Enter' })
  expect(window.location.hash).toBe('#/workspace/MDP-2')
})

it('alt enter opens the ticket in Jira in a new tab', async () => {
  const open = vi.fn()
  vi.stubGlobal('open', open)
  renderPalette()
  pressCtrlK()
  const input = await screen.findByRole('combobox')
  fireEvent.change(input, { target: { value: 'MDP-1' } })
  fireEvent.keyDown(input, { key: 'Enter', altKey: true })
  expect(open).toHaveBeenCalledWith('https://x.atlassian.net/browse/MDP-1', '_blank', 'noopener')
})

it('workspace sessions open in their tab', async () => {
  renderPalette()
  pressCtrlK()
  const input = await screen.findByRole('combobox')
  fireEvent.change(input, { target: { value: '~2' } })
  fireEvent.click(screen.getByRole('option', { name: /MDP-7~2/ }))
  expect(window.location.hash).toBe('#/workspace/MDP-7/MDP-7~2')
})

it('arrow keys move the highlight', async () => {
  renderPalette()
  pressCtrlK()
  const input = await screen.findByRole('combobox')
  const selected = (): string | null =>
    screen.getAllByRole('option').find((o) => o.getAttribute('aria-selected') === 'true')
      ?.textContent ?? null
  const first = selected()
  fireEvent.keyDown(input, { key: 'ArrowDown' })
  const second = selected()
  expect(second).not.toBeNull()
  expect(second).not.toBe(first)
  fireEvent.keyDown(input, { key: 'ArrowUp' })
  expect(selected()).toBe(first)
})

it('settings groups navigate to their group', async () => {
  renderPalette()
  pressCtrlK()
  const input = await screen.findByRole('combobox')
  fireEvent.change(input, { target: { value: 'guide' } })
  fireEvent.click(screen.getByRole('option', { name: /Guide/ }))
  expect(window.location.hash).toBe('#/settings/guide')
})

it('the top bar button opens the palette', async () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Shell page="insights" />
    </QueryClientProvider>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Search and jump to' }))
  expect(await screen.findByRole('combobox')).toBeInTheDocument()
})
