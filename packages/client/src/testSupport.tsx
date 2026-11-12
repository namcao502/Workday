import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, type RenderResult } from '@testing-library/react'
import type { SettingsView } from '@workday/core'
import type { ReactElement } from 'react'
import { vi, type Mock } from 'vitest'
import { isRecord } from './json.js'

export function renderWithQuery(element: ReactElement): RenderResult {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}>{element}</QueryClientProvider>)
}

export function settingsView(overrides: Partial<SettingsView> = {}): SettingsView {
  return {
    config: {
      port: 4870,
      timeZone: 'Asia/Ho_Chi_Minh',
      pollMinutes: 5,
      theme: 'dark',
      language: 'en',
      jira: null,
    },
    jiraTokenSource: null,
    ...overrides,
  }
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export type FetchMock = Mock<(url: string, init?: RequestInit) => Promise<Response>>

export function stubFetch(
  handler: (url: string, init: RequestInit | undefined) => Response,
): FetchMock {
  const fetchMock: FetchMock = vi.fn((url, init) => Promise.resolve(handler(url, init)))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

export function stubMatchMedia(matches: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  )
}

// The JSON body of the first request that carried one.
export function sentJson(fetchMock: FetchMock): Record<string, unknown> {
  for (const [, init] of fetchMock.mock.calls) {
    if (typeof init?.body === 'string') {
      const parsed: unknown = JSON.parse(init.body)
      if (isRecord(parsed)) {
        return parsed
      }
    }
  }
  throw new Error('No request carried a JSON body')
}
