import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import type { AgentStats, InsightsView, TicketReportRow } from '@workday/core'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { jsonResponse, renderWithQuery, settingsView, stubFetch } from '../testSupport.js'
import { InsightsPage } from './InsightsPage.js'
import { RANGE_STORAGE_KEY } from './useInsights.js'

const NO_USAGE = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  turns: 0,
  turnSeconds: 0,
}

const AGENT: AgentStats = {
  contextTokens: null,
  contextWindow: 200000,
  model: null,
  sessions: 1,
  turns: 3,
  turnSeconds: 90,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  compacts: [
    {
      at: '2026-11-10T03:00:00Z',
      isAuto: true,
      preTokens: 150000,
      postTokens: 20000,
      durationMs: 4000,
    },
  ],
  skills: [{ at: '2026-11-10T03:00:00Z', skill: 'plan-write', args: null }],
  subagents: [],
  tools: { Bash: { calls: 7, errors: 1 } },
  apiErrors: [],
  lastActivity: null,
  days: null,
}

function row(key: string, overrides: Partial<TicketReportRow> = {}): TicketReportRow {
  return {
    ticketKey: key,
    facts: { summary: `Summary of ${key}`, status: 'In Progress', section: null },
    hours: 2,
    sessions: 1,
    turns: 3,
    claudeSeconds: 90,
    tokens: { ...NO_USAGE, inputTokens: 1200 },
    commits: null,
    agent: AGENT,
    ...overrides,
  }
}

function view(rows: readonly TicketReportRow[], hoursRead = true): InsightsView {
  return {
    report: {
      range: { kind: 'thisWeek', from: '2026-11-09', to: '2026-11-13' },
      rows,
      hoursRead,
      hoursByDay: hoursRead ? { '2026-11-10': 2 } : {},
      tokensByDay: { '2026-11-10': 1200 },
    },
    readAt: '2026-11-12T03:00:00Z',
  }
}

beforeEach(() => {
  localStorage.removeItem(RANGE_STORAGE_KEY)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function insightsCalls(fetchMock: ReturnType<typeof stubFetch>): string[] {
  return fetchMock.mock.calls.map(([url]) => url).filter((url) => url.startsWith('/api/insights'))
}

it('insights page reads on open and again when the range changes', async () => {
  const fetchMock = stubFetch((url) =>
    jsonResponse(url.startsWith('/api/insights') ? view([row('MDP-1')]) : settingsView()),
  )
  renderWithQuery(<InsightsPage />)
  await screen.findByText('Summary of MDP-1')
  expect(insightsCalls(fetchMock)).toEqual(['/api/insights?kind=thisWeek'])
  fireEvent.click(screen.getByRole('radio', { name: 'Last week' }))
  await waitFor(() => {
    expect(insightsCalls(fetchMock)).toEqual([
      '/api/insights?kind=thisWeek',
      '/api/insights?kind=lastWeek',
    ])
  })
  expect(localStorage.getItem(RANGE_STORAGE_KEY)).toContain('lastWeek')
})

it('a failed read keeps the last report and shows the error', async () => {
  stubFetch((url) => {
    if (url === '/api/insights?kind=lastWeek') {
      return jsonResponse({ ok: false, error: { code: 'insightsFailed' } }, 500)
    }
    return jsonResponse(url.startsWith('/api/insights') ? view([row('MDP-1')]) : settingsView())
  })
  renderWithQuery(<InsightsPage />)
  await screen.findByText('Summary of MDP-1')
  fireEvent.click(screen.getByRole('radio', { name: 'Last week' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('The report could not be read')
  expect(screen.getByText('Summary of MDP-1')).toBeInTheDocument()
})

it('hours cells show a dash when HRM was not read', async () => {
  stubFetch((url) =>
    jsonResponse(
      url.startsWith('/api/insights')
        ? view([row('MDP-1', { hours: null })], false)
        : settingsView(),
    ),
  )
  renderWithQuery(<InsightsPage />)
  const cells = within(await screen.findByRole('row', { name: /MDP-1/ })).getAllByRole('cell')
  expect(cells[3]).toHaveTextContent('–')
  expect(screen.getByText('HRM hours could not be read (see log)')).toBeInTheDocument()
})

it('clicking a row shows its Claude detail tables', async () => {
  stubFetch((url) =>
    jsonResponse(url.startsWith('/api/insights') ? view([row('MDP-1')]) : settingsView()),
  )
  renderWithQuery(<InsightsPage />)
  expect(screen.queryByText('plan-write')).not.toBeInTheDocument()
  fireEvent.click(await screen.findByText('Summary of MDP-1'))
  expect(screen.getByText('plan-write')).toBeInTheDocument()
  expect(screen.getByText('Bash')).toBeInTheDocument()
  expect(screen.getByText('150k → 20k')).toBeInTheDocument()
})
