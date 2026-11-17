import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import type { TodoGroup } from '@workday/core'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  jsonResponse,
  renderRemote,
  renderWithQuery,
  stubFetch,
  stubMatchMedia,
} from '../testSupport.js'
import { BoardPage } from './BoardPage.js'
import { boardOf, boardRow, workView } from './workTestSupport.js'

const ROWS = [boardRow('MDP-1', 'Alpha work'), boardRow('MDP-2', 'Beta work')]

const GROUPS: readonly TodoGroup[] = [
  {
    ticketKey: 'MDP-1',
    neededNow: true,
    items: [
      {
        kind: 'claudeWaiting',
        session: 'MDP-1',
        tab: 'MDP-1',
        ticketKey: 'MDP-1',
        wait: 'permission',
      },
      { kind: 'overdue', ticketKey: 'MDP-1', section: 'inProgress' },
    ],
  },
  {
    ticketKey: 'MDP-2',
    neededNow: false,
    items: [
      {
        kind: 'readyToTest',
        ticketKey: 'MDP-2',
        steps: ['Deployed to Dev', 'Ready to Test'],
        deploy: null,
      },
    ],
  },
]

function stubBackend(
  groups: readonly TodoGroup[],
  onPost: (url: string) => Response = () => jsonResponse({}),
) {
  return stubFetch((url, init) => {
    if (init?.method === 'POST') {
      return onPost(url)
    }
    if (url === '/api/work') {
      return jsonResponse(workView({ groups, attention: 1 }))
    }
    return jsonResponse(url === '/api/board' ? boardOf(ROWS) : {}, url === '/api/board' ? 200 : 500)
  })
}

async function openTodoView(): Promise<void> {
  fireEvent.click(await screen.findByRole('radio', { name: /^To do/ }))
}

beforeEach(() => {
  stubMatchMedia(false)
})

afterEach(() => {
  vi.unstubAllGlobals()
  window.location.hash = ''
})

it('todo view lists needed-now groups first with their actions', async () => {
  stubBackend(GROUPS)
  renderWithQuery(<BoardPage />)
  await waitFor(() => {
    expect(screen.getByRole('radio', { name: 'To do (2)' })).toBeInTheDocument()
  })
  await openTodoView()
  const titles = (
    await screen.findAllByText(/Claude needs your permission|on dev now|dev PR merged/)
  ).map((node) => node.textContent)
  expect(titles).toEqual(['Claude needs your permission', 'dev PR merged'])
  expect(screen.getByRole('button', { name: 'Open' })).toBeInTheDocument()
  expect(
    screen.getByRole('button', { name: '-> Deployed to Dev -> Ready to Test' }),
  ).toBeInTheDocument()
})

it('ready to test asks first and shows the outcome', async () => {
  const fetchMock = stubBackend(GROUPS, () => jsonResponse({ status: 'moved' }))
  renderWithQuery(<BoardPage />)
  await openTodoView()
  fireEvent.click(
    await screen.findByRole('button', { name: '-> Deployed to Dev -> Ready to Test' }),
  )
  expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Move' }))
  expect(await screen.findByText('MDP-2 moved to Ready to Test')).toBeInTheDocument()
  expect(fetchMock).toHaveBeenCalledWith('/api/work/ready-to-test/MDP-2', { method: 'POST' })
})

it('a remote device sees no workspace action on a Claude to-do', async () => {
  stubBackend(GROUPS)
  renderRemote(<BoardPage />, { board: 'act', timesheet: 'off' })
  await openTodoView()
  expect(await screen.findByText('Claude needs your permission')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Open' })).not.toBeInTheDocument()
})

it("a teams to-do opens the ticket's Teams view", async () => {
  const teamsGroup: TodoGroup = {
    ticketKey: 'MDP-1',
    neededNow: true,
    items: [
      {
        kind: 'teamsMessage',
        ticketKey: 'MDP-1',
        item: {
          title: 'Team > Chan',
          senderName: 'Minh',
          sentAt: '2026-11-01T08:00:00Z',
          mentionsMe: true,
          conversationId: 'c1',
          ticketKey: 'MDP-1',
          conversationKey: 'k1',
          chatId: null,
        },
      },
    ],
  }
  stubBackend([teamsGroup])
  renderWithQuery(<BoardPage />)
  await openTodoView()
  expect(await screen.findByText('Team > Chan: Minh')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Open' }))
  expect(window.location.hash).toBe('#/workspace/MDP-1?teams=c1')
})

it('Seen on a teams to-do marks the conversation read', async () => {
  const teamsGroup: TodoGroup = {
    ticketKey: 'MDP-1',
    neededNow: true,
    items: [
      {
        kind: 'teamsMessage',
        ticketKey: 'MDP-1',
        item: {
          title: 'Team > Chan',
          senderName: 'Minh',
          sentAt: '2026-11-01T08:00:00Z',
          mentionsMe: true,
          conversationId: 'c1',
          ticketKey: 'MDP-1',
          conversationKey: 'k1',
          chatId: null,
        },
      },
    ],
  }
  const posted: string[] = []
  stubBackend([teamsGroup], (url) => {
    posted.push(url)
    return jsonResponse({ ok: true })
  })
  renderWithQuery(<BoardPage />)
  await openTodoView()
  fireEvent.click(await screen.findByRole('button', { name: 'Seen' }))
  await waitFor(() => {
    expect(posted).toEqual(['/api/teams/MDP-1/seen'])
  })
})

const JIRA_GROUP: TodoGroup = {
  ticketKey: 'MDP-1',
  neededNow: false,
  items: [
    {
      kind: 'jiraUpdated',
      ticketKey: 'MDP-1',
      section: 'inProgress',
      fields: ['summary'],
      changedBy: 'Minh',
    },
  ],
}

it('TodoView jiraUpdated shows Seen and View changes', async () => {
  const content = {
    summary: 'S',
    description: '',
    attachments: '',
    dueDate: null,
    eta: null,
    devPriority: null,
  }
  const fetchMock = stubFetch((url, init) => {
    if (url === '/api/work') {
      return jsonResponse(workView({ groups: [JIRA_GROUP], attention: 1 }))
    }
    if (url === '/api/board') {
      return jsonResponse(boardOf(ROWS))
    }
    if (url === '/api/tickets/MDP-1/update') {
      const update = {
        fields: ['summary'],
        viewed: content,
        current: content,
        changedBy: null,
        changedAt: null,
      }
      return jsonResponse({ update })
    }
    return init?.method === 'POST' ? jsonResponse({ ok: true }) : jsonResponse({}, 500)
  })
  renderWithQuery(<BoardPage />)
  await openTodoView()
  expect(await screen.findByRole('button', { name: 'View changes' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Seen' }))
  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/tickets/MDP-1/update/viewed',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ shown: content }) }),
    )
  })
})

it('TodoView jiraUpdated hides Seen without act access', async () => {
  stubBackend([JIRA_GROUP])
  renderRemote(<BoardPage />, { board: 'view', timesheet: 'off' })
  await openTodoView()
  expect(await screen.findByRole('button', { name: 'View changes' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Seen' })).not.toBeInTheDocument()
})

const DB_GROUP: TodoGroup = {
  ticketKey: 'MDP-1',
  neededNow: true,
  items: [
    {
      kind: 'dbReview',
      ticketKey: 'MDP-1',
      approval: {
        ticketKey: 'MDP-1',
        conversationKey: 'k9',
        channelId: 'ch1',
        approverName: 'Minh',
        approvedAt: '2026-11-01T08:00:00Z',
        sql: 'ALTER TABLE X ADD Y INT',
      },
    },
  ],
}

it('TodoRow dbReview copies the SQL to the clipboard', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('navigator', { clipboard: { writeText } })
  stubBackend([DB_GROUP])
  renderWithQuery(<BoardPage />)
  await openTodoView()
  expect(await screen.findByText(/DB change approved by Minh/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Copy SQL' }))
  await waitFor(() => {
    expect(writeText).toHaveBeenCalledWith('ALTER TABLE X ADD Y INT')
  })
  expect(await screen.findByText('SQL copied')).toBeInTheDocument()
})

it('TodoRow dbReview Done posts the conversation key', async () => {
  const fetchMock = stubBackend([DB_GROUP], () => jsonResponse({ ok: true }))
  renderWithQuery(<BoardPage />)
  await openTodoView()
  fireEvent.click(await screen.findByRole('button', { name: 'Done' }))
  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/teams/db-review/done',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ conversationKey: 'k9' }) }),
    )
  })
})

const QC_BUG_GROUP: TodoGroup = {
  ticketKey: 'MDP-1',
  neededNow: true,
  items: [{ kind: 'qcBug', ticketKey: 'MDP-9', parentKey: 'MDP-1' }],
}

it('TodoView qcBug shows Fix and calls the fix action', async () => {
  const fetchMock = stubBackend([QC_BUG_GROUP], () => jsonResponse({ ok: true }))
  renderWithQuery(<BoardPage />)
  await openTodoView()
  expect(await screen.findByText('MDP-9: QC bug on MDP-1')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Fix' }))
  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledWith('/api/work/bugs/MDP-9/fix', { method: 'POST' })
  })
})

it('TodoView qcBug names the parent when its worktree is missing', async () => {
  stubBackend([QC_BUG_GROUP], () =>
    jsonResponse({ ok: false, error: { code: 'parentWorktreeMissing', parentKey: 'MDP-1' } }, 409),
  )
  renderWithQuery(<BoardPage />)
  await openTodoView()
  fireEvent.click(await screen.findByRole('button', { name: 'Fix' }))
  expect(await screen.findByText(/MDP-1 has no worktree yet/)).toBeInTheDocument()
})

it('TodoView qcBug hides Fix without act access', async () => {
  stubBackend([QC_BUG_GROUP])
  renderRemote(<BoardPage />, { board: 'view', timesheet: 'off' })
  await openTodoView()
  expect(await screen.findByText('MDP-9: QC bug on MDP-1')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Fix' })).not.toBeInTheDocument()
})

it('TodoView qcBugReply shows Reply and navigates to the parent thread', async () => {
  const fix = {
    bugKey: 'MDP-9',
    parentKey: 'MDP-1',
    summary: 'Broken',
    description: '',
    pullRequests: [],
    draftWrittenAt: '2026-11-01T08:00:00Z',
  }
  stubBackend([
    {
      ticketKey: 'MDP-1',
      neededNow: true,
      items: [{ kind: 'qcBugReply', ticketKey: 'MDP-9', parentKey: 'MDP-1', fix }],
    },
  ])
  renderWithQuery(<BoardPage />)
  await openTodoView()
  expect(await screen.findByText(/MDP-9 is fixed - answer QC on MDP-1/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Reply' }))
  expect(window.location.hash).toBe('#/workspace/MDP-1?teams=')
})
