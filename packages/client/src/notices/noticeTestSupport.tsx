import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, waitFor } from '@testing-library/react'
import { expect } from 'vitest'
import type { Notice, NoticePrefs, NoticesView } from '@workday/core'
import type { ReactElement } from 'react'
import { queryKeys } from '../api/client.js'
import { jsonResponse, stubFetch, type FetchMock } from '../testSupport.js'

export function notice(id: number, overrides: Partial<Notice> = {}): Notice {
  return {
    id,
    at: '2026-11-13T02:00:00Z',
    topic: 'jira',
    tone: 'info',
    event: { type: 'movedToReadyToTest', key: `MDP-${String(id)}` },
    target: { kind: 'board', key: `MDP-${String(id)}` },
    place: null,
    read: false,
    ...overrides,
  }
}

export interface NoticeHarness {
  readonly fetchMock: FetchMock
  readonly queryClient: QueryClient
  readonly setView: (notices: readonly Notice[], prefs?: NoticePrefs) => void
  readonly reload: () => Promise<void>
}

// A fake /api/notices whose list the test can change, then reload.
export function renderNotices(
  element: ReactElement,
  initial: readonly Notice[],
  prefs: NoticePrefs = {},
): NoticeHarness {
  let current: NoticesView = {
    notices: initial,
    unread: initial.filter((item) => !item.read).length,
    prefs,
  }
  const fetchMock = stubFetch((url, init) => {
    if (url === '/api/notices/read-all' && init?.method === 'POST') {
      current = {
        ...current,
        notices: current.notices.map((item) => ({ ...item, read: true })),
        unread: 0,
      }
    }
    return jsonResponse(current)
  })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={queryClient}>{element}</QueryClientProvider>)
  return {
    fetchMock,
    queryClient,
    setView: (notices, nextPrefs = prefs) => {
      current = { notices, unread: notices.filter((item) => !item.read).length, prefs: nextPrefs }
    },
    reload: () => queryClient.invalidateQueries({ queryKey: queryKeys.notices }),
  }
}

// Resolves once the first /api/notices response is in the cache and rendered.
export async function firstLoad(harness: NoticeHarness): Promise<void> {
  await waitFor(() => {
    expect(harness.queryClient.getQueryData(queryKeys.notices)).toBeDefined()
  })
  await act(() => Promise.resolve())
}
