import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, type RenderResult } from '@testing-library/react'
import type { DeviceRights, RemoteDevice, SettingsView } from '@workday/core'
import type { ReactElement } from 'react'
import { vi, type Mock } from 'vitest'
import { AccessContext, accessFor } from './api/useMe.js'
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
      timesheet: { logTime: '18:00', hrm: null, tsc: null },
      remote: null,
      workspace: {
        devRepoPath: null,
        siblingRepoGlob: null,
        startPrompt: null,
        claudeExecutable: null,
        localOnlyPaths: [],
        chatView: false,
      },
      azureDevOps: null,
      teams: { watchedChannels: [], postLeadName: null, postGreeting: null },
      notices: {},
    },
    jiraTokenSource: null,
    hrmKeySource: null,
    tunnelTokenSource: null,
    adoPatSource: null,
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

export function remoteDevice(
  rights: DeviceRights,
  overrides: Partial<RemoteDevice> = {},
): RemoteDevice {
  return {
    id: 'd1',
    name: 'iPhone',
    email: 'me@example.com',
    rights,
    pushEnabled: false,
    hasPushSubscription: false,
    createdAt: '2026-11-01T00:00:00Z',
    lastSeenAt: null,
    ...overrides,
  }
}

// Renders as a paired remote device with the given rights.
export function renderRemote(element: ReactElement, rights: DeviceRights): RenderResult {
  const access = accessFor({ mode: 'remote', device: remoteDevice(rights) })
  return renderWithQuery(<AccessContext.Provider value={access}>{element}</AccessContext.Provider>)
}
