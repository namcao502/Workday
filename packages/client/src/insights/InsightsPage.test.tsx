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
    facts: {
      summary: `Summary of ${key}`,
      status: 'In Progress',
      statusCategory: 'indeterminate',
      section: null,
    },
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

it('the status cell is colored by the Jira status category', async () => {
  stubFetch((url) =>
    jsonResponse(url.startsWith('/api/insights') ? view([row('MDP-1')]) : settingsView()),
  )
  renderWithQuery(<InsightsPage />)
  expect(await screen.findByText('In Progress')).toHaveClass('text-accent')
})

it('the key and status columns are centered', async () => {
  stubFetch((url) =>
    jsonResponse(url.startsWith('/api/insights') ? view([row('MDP-1')]) : settingsView()),
  )
  renderWithQuery(<InsightsPage />)
  await screen.findByText('Summary of MDP-1')
  const table = screen.getAllByRole('table')[0] as HTMLElement
  const headers = within(table).getAllByRole('columnheader')
  const cells = within(within(table).getAllByRole('row')[1] as HTMLElement).getAllByRole('cell')
  for (const index of [0, 2]) {
    expect(headers[index]).toHaveClass('text-center')
    expect(cells[index]).toHaveClass('text-center')
  }
  expect(cells[1]).not.toHaveClass('text-center')
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

it('the Claude detail of the first ticket shows from the start, a click hides or shows it', async () => {
  stubFetch((url) =>
    jsonResponse(
      url.startsWith('/api/insights') ? view([row('MDP-1'), row('MDP-2')]) : settingsView(),
    ),
  )
  renderWithQuery(<InsightsPage />)
  expect(await screen.findByRole('heading', { name: 'MDP-1' })).toBeInTheDocument()
  expect(screen.getAllByText('plan-write')).toHaveLength(1)
  expect(screen.getByText('Bash')).toBeInTheDocument()
  expect(screen.getByText('150k → 20k')).toBeInTheDocument()
  fireEvent.click(screen.getByText('Summary of MDP-1'))
  expect(screen.queryByText('plan-write')).not.toBeInTheDocument()
  fireEvent.click(screen.getByText('Summary of MDP-2'))
  expect(screen.getByRole('heading', { name: 'MDP-2' })).toBeInTheDocument()
})

it('detail times follow the configured time zone', async () => {
  const utc = settingsView({ config: { ...settingsView().config, timeZone: 'UTC' } })
  stubFetch((url) => jsonResponse(url.startsWith('/api/insights') ? view([row('MDP-1')]) : utc))
  renderWithQuery(<InsightsPage />)
  await screen.findByText('Summary of MDP-1')
  // 03:00Z is 3:00 AM in UTC, 10:00 AM in Ho Chi Minh.
  expect(await screen.findAllByText(/Nov 10, 3:00\sAM/)).not.toHaveLength(0)
  expect(screen.queryByText(/10:00\sAM/)).not.toBeInTheDocument()
})

it('keeps Refresh in the bar and puts Copy markdown and Export CSV in the actions menu', async () => {
  stubFetch((url) =>
    jsonResponse(url.startsWith('/api/insights') ? view([row('MDP-1')]) : settingsView()),
  )
  renderWithQuery(<InsightsPage />)
  await screen.findByText('Summary of MDP-1')
  expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Copy markdown' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Report actions' }))
  expect(await screen.findByRole('menuitem', { name: 'Copy markdown' })).toBeInTheDocument()
  expect(screen.getByRole('menuitem', { name: 'Export CSV...' })).toBeInTheDocument()
})
