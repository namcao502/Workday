import { fireEvent, screen, waitFor } from '@testing-library/react'
import type { AppError, BoardRow, BoardView, SettingsView } from '@workday/core'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { BoardPage } from './BoardPage.js'
import {
  jsonResponse,
  settingsView,
  stubFetch,
  stubMatchMedia,
  renderWithQuery,
  renderRemote,
  type FetchMock,
} from '../testSupport.js'

function row(
  key: string,
  section: BoardRow['section'],
  summary: string,
  overrides: Partial<BoardRow['ticket']> = {},
  dueUrgency: BoardRow['dueUrgency'] = 'none',
): BoardRow {
  return {
    ticket: {
      key,
      summary,
      dueDate: null,
      eta: null,
      devPriority: null,
      status: 'To Do',
      statusCategory: null,
      issueType: null,
      timeSpentSeconds: null,
      updated: null,
      parentKey: null,
      ...overrides,
    },
    section,
    dueUrgency,
    url: `https://example.atlassian.net/browse/${key}`,
  }
}

function boardView(rows: readonly BoardRow[], overrides: Partial<BoardView> = {}): BoardView {
  return { connected: true, lastPoll: null, today: '2026-11-12', rows, ...overrides }
}

function connectedSettings(): SettingsView {
  const base = settingsView()
  return {
    ...base,
    config: {
      ...base.config,
      jira: {
        baseUrl: 'https://example.atlassian.net',
        email: 'me@example.com',
        projectKey: 'MDP',
        assignedJql: 'assignee = currentUser()',
        mineJql: 'assignee = currentUser()',
        maxResults: 50,
        etaFieldId: null,
        devPriorityFieldId: null,
        statusFlow: { preWorkStatuses: [], reworkStatuses: [] },
      },
    },
  }
}

interface Backend {
  readonly board: BoardView
  readonly addResponse?: Response
}

function stubBackend({ board, addResponse }: Backend): FetchMock {
  return stubFetch((url) => {
    if (url === '/api/settings') {
      return jsonResponse(connectedSettings())
    }
    if (url === '/api/board/add') {
      return addResponse ?? jsonResponse({ ok: true })
    }
    return jsonResponse(board)
  })
}

function postedUrls(fetchMock: FetchMock): readonly string[] {
  return fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST').map(([url]) => url)
}

beforeEach(() => {
  stubMatchMedia(false)
})

afterEach(() => {
  vi.unstubAllGlobals()
  window.location.hash = ''
})

const TWO_VIEWS = boardView([
  row('MDP-1', 'new', 'Alpha work'),
  row('MDP-2', 'done', 'Beta finished'),
])

it('the search switches to the view that has hits unless the user picked one', async () => {
  stubBackend({ board: TWO_VIEWS })
  renderWithQuery(<BoardPage />)
  await screen.findByText('Alpha work')
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'beta' } })
  await waitFor(() => {
    expect(screen.getByRole('radio', { name: 'Done (1)' })).toHaveAttribute('aria-checked', 'true')
  })
  expect(screen.getByRole('radio', { name: 'Working (0)' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('radio', { name: 'Working (0)' }))
  await new Promise((resolve) => setTimeout(resolve, 300))
  expect(screen.getByRole('radio', { name: 'Working (0)' })).toHaveAttribute('aria-checked', 'true')
})

it('typing a key not on the board shows Add KEY and Enter adds it', async () => {
  const fetchMock = stubBackend({ board: TWO_VIEWS })
  renderWithQuery(<BoardPage />)
  const searchBox = screen.getByRole('searchbox')
  fireEvent.change(searchBox, { target: { value: 'mdp-9' } })
  await screen.findByRole('button', { name: 'Add MDP-9' })
  fireEvent.keyDown(searchBox, { key: 'Enter' })
  await waitFor(() => {
    expect(postedUrls(fetchMock)).toContain('/api/board/add')
  })
  await waitFor(() => {
    expect(searchBox).toHaveValue('')
  })
})

it('an add error shows under the search box', async () => {
  const error: AppError = { code: 'notFound', key: 'MDP-9' }
  stubBackend({ board: TWO_VIEWS, addResponse: jsonResponse({ ok: false, error }, 409) })
  renderWithQuery(<BoardPage />)
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'MDP-9' } })
  fireEvent.click(await screen.findByRole('button', { name: 'Add MDP-9' }))
  expect(await screen.findByText('MDP-9 was not found')).toBeInTheDocument()
})

it('Dismiss in the row menu calls the dismiss action', async () => {
  const fetchMock = stubBackend({ board: TWO_VIEWS })
  renderWithQuery(<BoardPage />)
  fireEvent.click(await screen.findByRole('button', { name: 'Actions for MDP-1' }))
  fireEvent.click(screen.getByRole('menuitem', { name: 'Dismiss' }))
  await waitFor(() => {
    expect(postedUrls(fetchMock)).toContain('/api/board/MDP-1/dismiss')
  })
})

it("an overdue ticket's due cell uses the overdue color, a done ticket's never does", async () => {
  const board = boardView([
    row('MDP-1', 'new', 'Late work', { dueDate: '2026-11-10' }, 'overdue'),
    row('MDP-2', 'done', 'Finished late', { dueDate: '2026-11-11' }, 'overdue'),
  ])
  stubBackend({ board })
  renderWithQuery(<BoardPage />)
  expect(await screen.findByText('Nov 10')).toHaveClass('due-overdue')
  fireEvent.click(screen.getByRole('radio', { name: 'Done (1)' }))
  expect(screen.getByText('Nov 11')).not.toHaveClass('due-overdue')
})

it('without Jira the page links to Settings instead of a table', async () => {
  stubBackend({ board: boardView([], { connected: false }) })
  renderWithQuery(<BoardPage />)
  expect(await screen.findByText('Jira is not connected - open Settings')).toBeInTheDocument()
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Open Settings' }))
  expect(window.location.hash).toBe('#/settings')
})

it('a board view device sees no Add, Check now or row menu', async () => {
  stubBackend({ board: TWO_VIEWS })
  renderRemote(<BoardPage />, { board: 'view', timesheet: 'off' })
  await screen.findByText('Alpha work')
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'mdp-9' } })
  await new Promise((resolve) => setTimeout(resolve, 50))
  expect(screen.queryByRole('button', { name: 'Add MDP-9' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Check now/ })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Actions for/ })).not.toBeInTheDocument()
})

it('a board act device keeps Check now and the row menu', async () => {
  stubBackend({ board: TWO_VIEWS })
  renderRemote(<BoardPage />, { board: 'act', timesheet: 'off' })
  expect(await screen.findByRole('button', { name: 'Actions for MDP-1' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Check now/ })).toBeInTheDocument()
})

interface WorkspaceBackend {
  readonly configured: boolean
  readonly openKeys?: readonly string[]
  readonly open?: Response
}

function stubWorkspaceBackend({ configured, openKeys = [], open }: WorkspaceBackend): FetchMock {
  const workspace = {
    configured,
    tabs: openKeys.map((id) => ({ id, kind: 'ticket', folder: null, sessions: [id] })),
    sessions: [],
    starting: [],
    recentFolders: [],
  }
  return stubFetch((url) => {
    if (url === '/api/settings') {
      return jsonResponse(connectedSettings())
    }
    if (url === '/api/workspace') {
      return jsonResponse(workspace)
    }
    if (url.startsWith('/api/workspace/open/')) {
      return open ?? jsonResponse({ ok: true, warning: null })
    }
    if (url.startsWith('/api/workspace/start/')) {
      return jsonResponse({ ok: true, warning: null })
    }
    return jsonResponse(TWO_VIEWS)
  })
}

async function openRowMenu(): Promise<void> {
  fireEvent.click(await screen.findByRole('button', { name: 'Actions for MDP-1' }))
}

it('Start and Open show in the Working menu once the workspace is configured', async () => {
  stubWorkspaceBackend({ configured: true })
  renderWithQuery(<BoardPage />)
  await screen.findByText('Alpha work')
  await openRowMenu()
  await screen.findByRole('menuitem', { name: 'Start' })
  expect(screen.getByRole('menuitem', { name: 'Open' })).toBeInTheDocument()
})

it('Start and Open are hidden while the workspace is not configured', async () => {
  const fetchMock = stubWorkspaceBackend({ configured: false })
  renderWithQuery(<BoardPage />)
  await screen.findByText('Alpha work')
  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledWith('/api/workspace', { method: 'GET' })
  })
  await new Promise((resolve) => setTimeout(resolve, 50))
  await openRowMenu()
  expect(screen.queryByRole('menuitem', { name: 'Start' })).not.toBeInTheDocument()
  expect(screen.queryByRole('menuitem', { name: 'Open' })).not.toBeInTheDocument()
})

it('Start is hidden for a ticket that already has an open tab', async () => {
  stubWorkspaceBackend({ configured: true, openKeys: ['MDP-1'] })
  renderWithQuery(<BoardPage />)
  await screen.findByText('Alpha work')
  await openRowMenu()
  await screen.findByRole('menuitem', { name: 'Open' })
  expect(screen.queryByRole('menuitem', { name: 'Start' })).not.toBeInTheDocument()
})

it('Open asks before recreating a missing worktree, then sends recreate', async () => {
  const fetchMock = stubWorkspaceBackend({
    configured: true,
    open: jsonResponse({ ok: false, confirmRecreate: true }, 409),
  })
  renderWithQuery(<BoardPage />)
  await screen.findByText('Alpha work')
  await openRowMenu()
  await screen.findByRole('menuitem', { name: 'Open' })
  fireEvent.click(screen.getByRole('menuitem', { name: 'Open' }))
  expect(await screen.findByText('Recreate the MDP-1 worktree?')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Recreate' }))
  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/workspace/open/MDP-1',
      expect.objectContaining({ body: JSON.stringify({ recreate: true }) }),
    )
  })
})
