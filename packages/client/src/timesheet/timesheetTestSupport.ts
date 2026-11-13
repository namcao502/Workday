import type { DayCoverage, QueueEntry, SettingsView, TimesheetView } from '@workday/core'
import { jsonResponse, settingsView, stubFetch, type FetchMock } from '../testSupport.js'

export function coverage(date: string, overrides: Partial<DayCoverage> = {}): DayCoverage {
  return { date, hrmHours: null, tscText: null, isOff: false, tscState: 'read', ...overrides }
}

// Thursday 2026-11-12; the week Mon 9 .. Fri 13 as the server would read it.
export function timesheetView(overrides: Partial<TimesheetView> = {}): TimesheetView {
  return {
    tscConnected: true,
    hrmConnected: true,
    logTime: '18:00',
    today: '2026-11-12',
    queue: [],
    draining: false,
    lastRun: null,
    week: {
      monday: '2026-11-09',
      reading: false,
      coverage: [
        coverage('2026-11-09', { hrmHours: 8, tscText: 'MDP-1, MDP-2' }),
        coverage('2026-11-10', { isOff: true }),
        coverage('2026-11-11'),
        coverage('2026-11-12'),
        coverage('2026-11-13', { tscState: 'notDue' }),
      ],
      review: [],
      hrmTasks: [],
      readAt: null,
    },
    ...overrides,
  }
}

export function connectedSettings(): SettingsView {
  const base = settingsView()
  return {
    ...base,
    config: {
      ...base.config,
      jira: {
        baseUrl: 'https://example.atlassian.net',
        email: 'me@example.com',
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
  }
}

export function queued(date: string, tickets: readonly string[] = ['MDP-1']): QueueEntry {
  return { date, tickets, minutes: null }
}

export function backend(timesheet: TimesheetView, checks: unknown = []): FetchMock {
  return stubFetch((url, init) => {
    if (url === '/api/settings') {
      return jsonResponse(connectedSettings())
    }
    if (url === '/api/timesheet' && (init?.method ?? 'GET') === 'GET') {
      return jsonResponse(timesheet)
    }
    if (url === '/api/timesheet/tickets/check') {
      return jsonResponse(checks)
    }
    if (url === '/api/timesheet/queue') {
      return jsonResponse({ ok: true })
    }
    if (url === '/api/timesheet/off') {
      return jsonResponse({ date: '2026-11-12', tsc: { status: 'ok' }, hrm: { status: 'skipped' } })
    }
    return new Response(null, { status: 202 })
  })
}

export function bodyOf(fetchMock: FetchMock, path: string, index = 0): unknown {
  const calls = fetchMock.mock.calls.filter(
    ([url, init]) => url === path && typeof init?.body === 'string',
  )
  const body = calls[index]?.[1]?.body
  return typeof body === 'string' ? JSON.parse(body) : undefined
}

export function callsTo(fetchMock: FetchMock, path: string): number {
  return fetchMock.mock.calls.filter(([url]) => url === path).length
}
