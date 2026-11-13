import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import type { JobRun, KnowledgeScanConfig, ScanRun, SchedulesView } from '@workday/core'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { jsonResponse, renderWithQuery, settingsView, stubFetch } from '../testSupport.js'
import { SchedulesPage } from './SchedulesPage.js'
import { LOG_POLL_MS } from './useSchedules.js'

const CONFIG: KnowledgeScanConfig = {
  enabled: true,
  command: 'pwsh',
  args: ['-NoProfile', '-File', 'scan.ps1'],
  day: 'daily',
  time: '09:00',
  limitHours: 2,
  logFile: null,
}

function scanRun(overrides: Partial<ScanRun> = {}): ScanRun {
  return {
    id: 'r1',
    startedAt: '2026-11-12T02:00:00Z',
    endedAt: '2026-11-12T03:00:00Z',
    outcome: 'ok',
    exitCode: 0,
    found: 3,
    mined: 3,
    refreshed: 1,
    problemLines: [],
    trigger: 'schedule',
    ...overrides,
  }
}

function view(runs: readonly ScanRun[], jobRuns: readonly JobRun[] = []): SchedulesView {
  const idle = { runs: [], nextRunAt: null }
  return {
    scan: { config: CONFIG, nextRunAt: null, runs, unseenBad: true },
    jobs: {
      jiraPoll: { runs: jobRuns, nextRunAt: '2026-11-13T02:05:00Z' },
      prCheck: idle,
      teamsCheck: idle,
      timesheetRun: idle,
      catchUp: idle,
    },
  }
}

function serve(schedules: SchedulesView, logs: Record<string, unknown> = {}) {
  return stubFetch((url) => {
    if (url === '/api/schedules') {
      return jsonResponse(schedules)
    }
    if (url === '/api/settings') {
      return jsonResponse(settingsView())
    }
    if (url.includes('/log?')) {
      return jsonResponse(logs[url] ?? { text: '', next: 0 })
    }
    return jsonResponse({ ok: true })
  })
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it('schedules page marks bad runs seen on open', async () => {
  const fetchMock = serve(view([scanRun({ outcome: 'failed' })]))
  renderWithQuery(<SchedulesPage />)
  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledWith('/api/schedules/scan/seen', { method: 'POST' })
  })
})

it('changing the day saves the knowledge scan config', async () => {
  const fetchMock = serve(view([scanRun()]))
  renderWithQuery(<SchedulesPage />)
  fireEvent.click(await screen.findByRole('radio', { name: 'Fri' }))
  await waitFor(() => {
    const put = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT')
    const body = put?.[1]?.body
    expect(JSON.parse(typeof body === 'string' ? body : '')).toEqual({
      knowledgeScan: { ...CONFIG, day: 'fri' },
    })
  })
})

it('run now asks first', async () => {
  const fetchMock = serve(view([scanRun()]))
  renderWithQuery(<SchedulesPage />)
  fireEvent.click(await screen.findByRole('button', { name: 'Run now' }))
  const runCalls = (): number =>
    fetchMock.mock.calls.filter(([url]) => url === '/api/schedules/scan/run').length
  expect(runCalls()).toBe(0)
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Run now' }))
  await waitFor(() => {
    expect(runCalls()).toBe(1)
  })
})

it("a running scan's log is read on from the last offset", async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
  const base = '/api/schedules/scan/runs/r1/log?from='
  const fetchMock = serve(view([scanRun({ outcome: 'running', endedAt: null })]), {
    [`${base}0`]: { text: 'first\n', next: 6 },
    [`${base}6`]: { text: 'second\n', next: 13 },
  })
  renderWithQuery(<SchedulesPage />)
  await waitFor(() => {
    expect(screen.getByLabelText('Run log').textContent).toBe('first\n')
  })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(LOG_POLL_MS)
  })
  await waitFor(() => {
    expect(screen.getByLabelText('Run log').textContent).toBe('first\nsecond\n')
  })
  expect(fetchMock.mock.calls.some(([url]) => url === `${base}6`)).toBe(true)
})

it('jobs card shows the last result and the next run', async () => {
  const runs: JobRun[] = [
    {
      startedAt: '2026-11-13T01:00:00Z',
      endedAt: '2026-11-13T01:00:02Z',
      ok: false,
      summary: 'old failure',
    },
    {
      startedAt: '2026-11-13T02:00:00Z',
      endedAt: '2026-11-13T02:00:02Z',
      ok: true,
      summary: '4 tickets polled',
    },
  ]
  serve(view([], runs))
  renderWithQuery(<SchedulesPage />)
  const row = (await screen.findByText('Jira check')).closest('li')
  expect(row?.textContent).toContain('4 tickets polled')
  expect(row?.textContent).toContain('Next')
  expect(row?.getAttribute('title')).toContain('old failure')
})
