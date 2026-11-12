import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { renderWithQuery, stubMatchMedia } from '../testSupport.js'
import { TimesheetPage } from './TimesheetPage.js'
import { backend, bodyOf, callsTo, queued, timesheetView } from './timesheetTestSupport.js'

const MORNING_UTC = '2026-11-12T03:00:00Z' // 10:00 in Ho Chi Minh
const EVENING_UTC = '2026-11-12T11:30:00Z' // 18:30 in Ho Chi Minh

function card(name: RegExp): HTMLElement {
  return screen.getByRole('group', { name })
}

function openAt(isoTime: string): void {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(isoTime))
}

async function typeTickets(text: string): Promise<HTMLElement> {
  const input = await screen.findByRole('textbox', { name: 'Tickets' })
  fireEvent.change(input, { target: { value: text } })
  return input
}

beforeEach(() => {
  stubMatchMedia(false)
  openAt(MORNING_UTC)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it('adding typed tickets posts the date, the keys and null minutes for an even split', async () => {
  const fetchMock = backend(timesheetView())
  renderWithQuery(<TimesheetPage />)
  await typeTickets('MDP-1, 2')
  fireEvent.click(screen.getByRole('button', { name: 'Add to queue' }))
  await waitFor(() => {
    expect(bodyOf(fetchMock, '/api/timesheet/queue')).toEqual({
      date: '2026-11-12',
      tickets: ['MDP-1', 'MDP-2'],
      minutes: null,
    })
  })
})

it('the add button is disabled when the typed day goes over 8h', async () => {
  backend(timesheetView())
  renderWithQuery(<TimesheetPage />)
  await typeTickets('MDP-1')
  expect(screen.getByRole('button', { name: 'Add to queue' })).toBeEnabled()
  const hours = screen.getByLabelText('Hours for MDP-1')
  fireEvent.change(hours, { target: { value: '16' } })
  fireEvent.blur(hours)
  expect(screen.getByText('16h - over 8h')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Add to queue' })).toBeDisabled()
})

it('Log now for today before 6 PM is disabled and says after 6 PM', async () => {
  backend(timesheetView({ queue: [queued('2026-11-12')] }))
  renderWithQuery(<TimesheetPage />)
  const today = await screen.findByRole('group', { name: /THU 12/ })
  const button = within(today).getByRole('button', { name: /Log now/ })
  expect(button).toBeDisabled()
  expect(button).toHaveTextContent('after 6 PM')
  expect(within(today).getByText(/Auto-logs at 6:00 PM \(8h left\)/)).toBeInTheDocument()
})

it('a queued day past the run reads Retry', async () => {
  backend(timesheetView({ queue: [queued('2026-11-11')] }))
  renderWithQuery(<TimesheetPage />)
  const day = await screen.findByRole('group', { name: /WED 11/ })
  expect(within(day).getByRole('button', { name: 'Retry' })).toBeEnabled()
  expect(within(day).getByText('Past the auto-log time, not logged yet')).toBeInTheDocument()
})

it('the first visit reads this week with allowSniff, the previous week without', async () => {
  const fetchMock = backend(timesheetView())
  renderWithQuery(<TimesheetPage />)
  await screen.findByRole('group', { name: /MON 9/ })
  await waitFor(() => {
    expect(callsTo(fetchMock, '/api/timesheet/week')).toBe(1)
  })
  expect(bodyOf(fetchMock, '/api/timesheet/week')).toEqual({
    monday: '2026-11-09',
    allowSniff: true,
  })
  fireEvent.click(screen.getByRole('button', { name: 'Previous week' }))
  await waitFor(() => {
    expect(callsTo(fetchMock, '/api/timesheet/week')).toBe(2)
  })
  expect(bodyOf(fetchMock, '/api/timesheet/week', 1)).toEqual({
    monday: '2026-11-02',
    allowSniff: false,
  })
})

it('a day card shows Day off, the logged hours, or Nothing logged by its state', async () => {
  backend(timesheetView())
  renderWithQuery(<TimesheetPage />)
  const off = await screen.findByRole('group', { name: /TUE 10/ })
  expect(within(off).getByText('Day off')).toBeInTheDocument()
  const monday = card(/MON 9/)
  expect(within(monday).getByText(/8h/)).toBeInTheDocument()
  expect(within(monday).getByText(/MDP-1, MDP-2/)).toBeInTheDocument()
  expect(within(card(/WED 11/)).getByText(/Nothing logged/)).toBeInTheDocument()
  expect(within(card(/FRI 13/)).getByText('not yet')).toBeInTheDocument()
})

it('a ticket that is not mine shows Use KEY and the button swaps the key in the box', async () => {
  const check = {
    key: 'MDP-6798',
    status: 'valid',
    summary: 'Fix it',
    isMine: false,
    suggestedKey: 'MDP-6789',
  }
  backend(timesheetView(), [check])
  renderWithQuery(<TimesheetPage />)
  const input = await typeTickets('MDP-6798')
  expect(await screen.findByText('Not your ticket', {}, { timeout: 3000 })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Use MDP-6789' }))
  expect(input).toHaveValue('MDP-6789')
})

it('Log OFF asks before calling the server', async () => {
  const fetchMock = backend(timesheetView())
  renderWithQuery(<TimesheetPage />)
  await screen.findByRole('textbox', { name: 'Tickets' })
  fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
  fireEvent.click(screen.getByRole('menuitem', { name: 'Log OFF...' }))
  const dialog = screen.getByRole('dialog')
  expect(dialog).toHaveTextContent(
    "Mark Thu, Nov 12 as OFF in TSC? This overwrites the day's cell.",
  )
  expect(callsTo(fetchMock, '/api/timesheet/off')).toBe(0)
  fireEvent.click(within(dialog).getByRole('button', { name: 'Log OFF' }))
  await waitFor(() => {
    expect(bodyOf(fetchMock, '/api/timesheet/off')).toEqual({ date: '2026-11-12' })
  })
})

it('the reminder banner shows after the 6 PM reminder until today is queued', async () => {
  openAt(EVENING_UTC)
  const lastRun = { kind: 'reminder', at: EVENING_UTC, trigger: 'schedule' } as const
  backend(timesheetView({ lastRun }))
  renderWithQuery(<TimesheetPage />)
  const banner = 'Nothing is queued for today - log your work before you leave.'
  expect(await screen.findByText(banner)).toBeInTheDocument()
  cleanup()
  backend(timesheetView({ lastRun, queue: [queued('2026-11-12')] }))
  renderWithQuery(<TimesheetPage />)
  await screen.findByRole('group', { name: /THU 12/ })
  expect(screen.queryByText(banner)).not.toBeInTheDocument()
})
