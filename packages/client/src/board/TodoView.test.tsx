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
