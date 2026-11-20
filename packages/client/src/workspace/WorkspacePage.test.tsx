import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import type { SessionView, WorkspaceTab, WorkspaceView } from '@workday/core'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { jsonResponse, renderWithQuery, stubFetch, type FetchMock } from '../testSupport.js'
import { openWorkspaceFile } from './fileLinks.js'
import { WorkspacePage } from './WorkspacePage.js'

function ticketTab(id: string, extra: readonly string[] = []): WorkspaceTab {
  return { id, kind: 'ticket', folder: null, sessions: [id, ...extra] }
}

function session(name: string, overrides: Partial<SessionView> = {}): SessionView {
  return { name, running: true, wait: null, working: false, ...overrides }
}

function view(overrides: Partial<WorkspaceView> = {}): WorkspaceView {
  return {
    configured: true,
    tabs: [ticketTab('MDP-1'), ticketTab('MDP-2', ['MDP-2~2'])],
    sessions: [session('MDP-1', { wait: 'finished' }), session('MDP-2'), session('MDP-2~2')],
    starting: [],
    recentFolders: ['C:\\Work\\Notes'],
    ...overrides,
  }
}

function stubWorkspace(workspace: WorkspaceView): FetchMock {
  return stubFetch((url) => (url === '/api/workspace' ? jsonResponse(workspace) : jsonResponse({})))
}

beforeEach(() => {
  window.location.hash = '#/workspace'
  vi.stubGlobal('Notification', undefined)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

it('asks to set the dev repo when the workspace is not configured', async () => {
  stubWorkspace(view({ configured: false, tabs: [], sessions: [] }))
  renderWithQuery(<WorkspacePage />)
  expect(await screen.findByText('Set the dev repo in Settings')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Open Settings' })).toBeInTheDocument()
})

it('shows both tabs and a dot only on the tab with a waiting session', async () => {
  stubWorkspace(view())
  renderWithQuery(<WorkspacePage />)
  const first = await screen.findByRole('tab', { name: 'MDP-1' })
  const second = screen.getByRole('tab', { name: 'MDP-2' })
  expect(within(first).getByTestId('tab-dot')).toBeInTheDocument()
  expect(within(second).queryByTestId('tab-dot')).not.toBeInTheDocument()
})

it('asks before closing a tab with a running session, then deletes it', async () => {
  const fetchMock = stubWorkspace(view())
  renderWithQuery(<WorkspacePage />)
  fireEvent.click(await screen.findByRole('button', { name: 'Close MDP-2' }))
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false)
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close MDP-2' }))
  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/workspace/tabs/MDP-2',
      expect.objectContaining({ method: 'DELETE' }),
    )
  })
})

it('the + menu adds a terminal for the dev repo', async () => {
  const fetchMock = stubWorkspace(view())
  renderWithQuery(<WorkspacePage />)
  fireEvent.click(await screen.findByRole('button', { name: 'New terminal' }))
  fireEvent.click(screen.getByRole('menuitem', { name: 'Dev repo' }))
  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/workspace/terminals',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ folder: null }) }),
    )
  })
})

it('the workspace page renders no terminal and no .legacy-page', async () => {
  stubWorkspace(view())
  const { container } = renderWithQuery(<WorkspacePage />)
  await screen.findByTestId('workspace-left')
  expect(container.querySelector('.legacy-page')).toBeNull()
  expect(container.querySelector('.xterm, .terminal-host')).toBeNull()
  expect(screen.getAllByTestId(/^claude-session-/).length).toBeGreaterThan(0)
})

it('keeps every session of the open tab mounted and hides the unselected one', async () => {
  stubWorkspace(view())
  window.location.hash = '#/workspace/MDP-2/MDP-2~2'
  renderWithQuery(<WorkspacePage />)
  await screen.findByTestId('claude-session-MDP-2~2')
  await waitFor(() => {
    expect(screen.getByTestId('claude-session-MDP-2')).toHaveAttribute('hidden')
  })
  expect(screen.getByTestId('claude-session-MDP-2~2')).not.toHaveAttribute('hidden')
  expect(screen.getByTestId('claude-session-MDP-1')).toHaveAttribute('hidden')
})

it('switching tabs back and forth leaves exactly one file pane', async () => {
  stubWorkspace(view({ tabs: [ticketTab('MDP-1'), ticketTab('MDP-2'), ticketTab('MDP-3')] }))
  renderWithQuery(<WorkspacePage />)
  await screen.findByTestId('workspace-left')
  for (const id of ['MDP-2', 'MDP-3', 'MDP-1', 'MDP-3', 'MDP-2']) {
    fireEvent.click(screen.getByRole('tab', { name: id }))
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: id })).toHaveAttribute('aria-selected', 'true')
    })
  }
  expect(screen.getAllByTestId('workspace-left')).toHaveLength(1)
})

it('switching tickets keeps each Claude session mounted instead of remounting it', async () => {
  stubWorkspace(view())
  renderWithQuery(<WorkspacePage />)
  const first = await screen.findByTestId('claude-session-MDP-1')
  for (const id of ['MDP-2', 'MDP-1', 'MDP-2']) {
    fireEvent.click(screen.getByRole('tab', { name: id }))
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: id })).toHaveAttribute('aria-selected', 'true')
    })
  }
  expect(screen.getByTestId('claude-session-MDP-1')).toBe(first)
  expect(screen.getByTestId('claude-session-MDP-1')).toHaveAttribute('hidden')
  expect(screen.getByTestId('claude-session-MDP-2')).not.toHaveAttribute('hidden')
})

it('dropping a tab onto another moves it to that place', async () => {
  const fetchMock = stubWorkspace(view())
  renderWithQuery(<WorkspacePage />)
  const first = (await screen.findByRole('tab', { name: 'MDP-1' })).parentElement as HTMLElement
  const second = screen.getByRole('tab', { name: 'MDP-2' }).parentElement as HTMLElement
  const dataTransfer = { setData: vi.fn(), effectAllowed: '' }
  fireEvent.dragStart(second, { dataTransfer })
  fireEvent.dragOver(first, { dataTransfer })
  fireEvent.drop(first, { dataTransfer })
  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledWith('/api/workspace/tabs/MDP-2/position', {
      method: 'PUT',
      headers: expect.objectContaining({ 'Content-Type': 'application/json' }) as unknown,
      body: JSON.stringify({ index: 0 }),
    })
  })
})

it('opens on the tab the user left when the hash names none', async () => {
  localStorage.setItem(
    'workday.workspace.selection',
    JSON.stringify({ tab: 'MDP-2', session: 'MDP-2' }),
  )
  stubWorkspace(view())
  renderWithQuery(<WorkspacePage />)
  const second = await screen.findByRole('tab', { name: 'MDP-2' })
  expect(second).toHaveAttribute('aria-selected', 'true')
  localStorage.clear()
})

it('asks before closing a tab even when no session is running, and a running Claude 2 too', async () => {
  const fetchMock = stubWorkspace(
    view({
      sessions: [session('MDP-1', { running: false }), session('MDP-2'), session('MDP-2~2')],
    }),
  )
  renderWithQuery(<WorkspacePage />)
  fireEvent.click(await screen.findByRole('button', { name: 'Close MDP-1' }))
  expect(await screen.findByText('Close MDP-1?')).toBeInTheDocument()
  expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  await waitFor(() => {
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
  fireEvent.click(screen.getByRole('button', { name: 'Close Claude 2' }))
  expect(
    await screen.findByText('Claude 2 is still running. Close it and stop it?'),
  ).toBeInTheDocument()
  expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false)
})

it('a file link from the chat opens the file in the Files view of that tab', async () => {
  const groups = [
    {
      id: 'docs',
      label: 'Docs - MDP-1',
      root: 'C:/wt/MDP-1/docs/MDP-1',
      paths: ['plan.md'],
      error: null,
    },
    { id: 'wt0', label: 'BE - Backend', root: 'C:/wt/MDP-1', paths: ['src/app.ts'], error: null },
  ]
  stubFetch((url) => {
    if (url === '/api/workspace') {
      return jsonResponse(view())
    }
    if (url === '/api/workspace/tabs/MDP-1/files') {
      return jsonResponse(groups)
    }
    if (url.startsWith('/api/workspace/tabs/MDP-1/files/content') && url.includes('src%2Fapp.ts')) {
      return jsonResponse({ kind: 'text', text: 'export const answer = 42' })
    }
    return jsonResponse({})
  })
  window.location.hash = '#/workspace/MDP-1'
  renderWithQuery(<WorkspacePage />)
  await screen.findByTestId('workspace-left')
  // Start on Changes, so the link has to switch the pane to Files.
  fireEvent.click(screen.getByRole('tab', { name: 'Changes' }))
  act(() => {
    openWorkspaceFile('MDP-1', { group: 'wt0', path: 'src/app.ts', line: 1 })
  })
  // The viewer splits a line into highlighted pieces, so the pane's text is what to check.
  await waitFor(() => {
    expect(screen.getByTestId('workspace-left')).toHaveTextContent('export const answer = 42')
  })
  expect(screen.getByRole('tab', { name: 'Files' })).toHaveAttribute('aria-selected', 'true')
})
