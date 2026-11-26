import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { hoverTip, renderRemote, renderWithQuery, stubMatchMedia } from '../testSupport.js'
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

it('a queued day edits its hours in a dialog from the card menu, not inline', async () => {
  const fetchMock = backend(timesheetView({ queue: [queued('2026-11-11', ['MDP-1', 'MDP-2'])] }))
  renderWithQuery(<TimesheetPage />)
  const day = await screen.findByRole('group', { name: /WED 11/ })
  expect(within(day).queryByLabelText('Hours for MDP-1')).toBeNull()
  fireEvent.click(within(day).getByRole('button', { name: 'Day actions' }))
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Edit hours...' }))
  const dialog = await screen.findByRole('dialog', { name: /Edit hours/ })
  expect(within(dialog).getByText(/nothing already logged in HRM or TSC/)).toBeInTheDocument()
  const hours = within(dialog).getByLabelText('Hours for MDP-1')
  fireEvent.change(hours, { target: { value: '6' } })
  expect(within(dialog).getByText('10h / 8h')).toBeInTheDocument()
  expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled()
  fireEvent.change(hours, { target: { value: '3' } })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Half an hour more for MDP-2' }))
  expect(within(dialog).getByText('7.5h / 8h')).toBeInTheDocument()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
  await waitFor(() => {
    expect(bodyOf(fetchMock, '/api/timesheet/queue/2026-11-11/minutes')).toEqual({
      tickets: ['MDP-1', 'MDP-2'],
      minutes: [180, 270],
    })
  })
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

it('a day card shows leave, the logged hours, or Nothing logged by its state', async () => {
  backend(timesheetView())
  renderWithQuery(<TimesheetPage />)
  const off = await screen.findByRole('group', { name: /TUE 10/ })
  expect(within(off).getByText('Leave')).toBeInTheDocument()
  expect(within(off).getByText('Approved in HRM')).toBeInTheDocument()
  expect(screen.getByText('4 workdays, 1 off')).toBeInTheDocument()
  const monday = card(/MON 9/)
  expect(within(monday).getByText(/8h/)).toBeInTheDocument()
  expect(within(monday).getByText(/MDP-1, MDP-2/)).toBeInTheDocument()
  expect(within(card(/WED 11/)).getByText(/Nothing logged/)).toBeInTheDocument()
  expect(within(card(/FRI 13/)).getByText('not yet')).toBeInTheDocument()
})

it('a leave day not approved yet says Day of leave, not approved', async () => {
  const base = timesheetView()
  const week = base.week
  const coverage = (week?.coverage ?? []).map((day) =>
    day.date === '2026-11-10' ? { ...day, leaveApproved: false } : day,
  )
  backend({ ...base, week: week === null ? null : { ...week, coverage } })
  renderWithQuery(<TimesheetPage />)
  const off = await screen.findByRole('group', { name: /TUE 10/ })
  expect(within(off).getByText('Day of leave')).toBeInTheDocument()
  expect(within(off).queryByText('Approved in HRM')).toBeNull()
})

it('a holiday card says Public holiday and the holiday name', async () => {
  const base = timesheetView()
  const week = base.week
  const coverage = (week?.coverage ?? []).map((day) =>
    day.date === '2026-11-10' ? { ...day, holiday: { date: '11-10', name: 'Company day' } } : day,
  )
  backend({ ...base, week: week === null ? null : { ...week, coverage } })
  renderWithQuery(<TimesheetPage />)
  const off = await screen.findByRole('group', { name: /TUE 10/ })
  expect(within(off).getByText('Public holiday')).toBeInTheDocument()
  expect(within(off).getByText('Company day')).toBeInTheDocument()
})

it('an empty past day says Reading while the week read runs, not Nothing logged', async () => {
  const base = timesheetView()
  backend({ ...base, week: base.week === null ? null : { ...base.week, reading: true } })
  renderWithQuery(<TimesheetPage />)
  const wednesday = await screen.findByRole('group', { name: /WED 11/ })
  expect(within(wednesday).getByText('Reading...')).toBeInTheDocument()
  expect(within(wednesday).queryByText(/Nothing logged/)).toBeNull()
})

it('week bars measure each ticket against the whole working week', async () => {
  const base = timesheetView()
  const task = { date: '2026-11-09', ticketKey: 'MDP-1', summary: null, workingSeconds: 4 * 3600 }
  backend({
    ...base,
    week: base.week === null ? null : { ...base.week, hrmTasks: [task] },
  })
  renderWithQuery(<TimesheetPage />)
  await screen.findByText('This week by ticket')
  const track = document.querySelector('[data-slot="tooltip-trigger"].h-2')
  // 4h of a 40h week.
  expect(await hoverTip(track ?? document.body)).toHaveTextContent('10% of the week')
})

it('day cards show each ticket summary next to its key, the full text in a tooltip', async () => {
  const base = timesheetView({ queue: [queued('2026-11-11')] })
  const task = {
    date: '2026-11-09',
    ticketKey: 'MDP-9',
    summary: 'Sticker WIP filters',
    workingSeconds: 4 * 3600,
  }
  const check = {
    key: 'MDP-1',
    status: 'valid',
    summary: 'Queued one',
    isMine: true,
    suggestedKey: null,
  }
  backend({ ...base, week: base.week === null ? null : { ...base.week, hrmTasks: [task] } }, [
    check,
  ])
  renderWithQuery(<TimesheetPage />)
  await screen.findByRole('group', { name: /MON 9/ })
  const logged = within(card(/MON 9/)).getByText('Sticker WIP filters')
  expect(logged).toHaveClass('truncate')
  expect(await hoverTip(logged)).toHaveTextContent('Sticker WIP filters')
  expect(
    await within(card(/WED 11/)).findByText('Queued one', {}, { timeout: 3000 }),
  ).toBeInTheDocument()
})

it('marks today with a Today chip, and only today', async () => {
  backend(timesheetView())
  renderWithQuery(<TimesheetPage />)
  await screen.findByRole('group', { name: /THU 12/ })
  expect(within(card(/THU 12/)).getByText('Today')).toBeInTheDocument()
  expect(within(card(/WED 11/)).queryByText('Today')).toBeNull()
})

it('pressing anywhere on a day card picks that day', async () => {
  backend(timesheetView({ queue: [queued('2026-11-11')] }))
  renderWithQuery(<TimesheetPage />)
  await screen.findByRole('group', { name: /MON 9/ })
  // The picker keeps its value in a hidden input named after the field.
  const dateBox = document.querySelector('input[name="log-date"]')
  expect(dateBox).toHaveValue('2026-11-12')
  const monday = await screen.findByRole('group', { name: /MON 9/ })
  fireEvent.click(within(monday).getByText(/MDP-1, MDP-2/))
  expect(dateBox).toHaveValue('2026-11-09')
  const wednesday = card(/WED 11/)
  fireEvent.click(within(wednesday).getByText(/Past the auto-log time/))
  expect(dateBox).toHaveValue('2026-11-11')
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

it('a timesheet act device keeps the input and Retry', async () => {
  backend(timesheetView({ queue: [queued('2026-11-11')] }))
  renderRemote(<TimesheetPage />)
  const day = await screen.findByRole('group', { name: /WED 11/ })
  expect(within(day).getByRole('button', { name: 'Retry' })).toBeEnabled()
  expect(screen.getByRole('textbox', { name: 'Tickets' })).toBeInTheDocument()
})

it('says which parts of the week read are running, done or failed', async () => {
  const base = timesheetView()
  backend({
    ...base,
    week: {
      ...(base.week ?? {
        monday: '2026-11-09',
        reading: true,
        coverage: null,
        review: null,
        hrmTasks: null,
        readAt: null,
        steps: [],
      }),
      reading: true,
      steps: [
        { id: 'tsc', state: 'done' },
        { id: 'hrmHours', state: 'running' },
        { id: 'hrmTasks', state: 'pending' },
        { id: 'jira', state: 'failed' },
      ],
    },
  })
  renderWithQuery(<TimesheetPage />)
  expect(await screen.findByText(/Reading the week's logs:/)).toBeInTheDocument()
  const states = [...document.querySelectorAll('[data-state]')].map((node) => [
    node.textContent,
    node.getAttribute('data-state'),
  ])
  expect(states).toEqual([
    ['✓TSC sheet', 'done'],
    ['HRM hours', 'running'],
    ['-HRM tasks', 'pending'],
    ['!Jira tickets', 'failed'],
  ])
})

it('a worked-on ticket queues for the selected day with one press', async () => {
  const fetchMock = backend(
    timesheetView(),
    [],
    [{ ticketKey: 'MDP-7', summary: 'Seven', commits: 2, claude: true, shareMinutes: 480 }],
  )
  renderWithQuery(<TimesheetPage />)
  fireEvent.click(await screen.findByRole('button', { name: /MDP-7 2 commits - Claude - 8h/ }))
  await waitFor(() => {
    expect(bodyOf(fetchMock, '/api/timesheet/queue')).toEqual({
      date: '2026-11-12',
      tickets: ['MDP-7'],
      minutes: null,
    })
  })
})
it('at 4 columns the worked-on suggestions sit inside the big today card', async () => {
  // A grid 1100px wide: four 260px columns, so the bento layout applies.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(private readonly callback: (entries: unknown[]) => void) {}
      observe(): void {
        this.callback([{ contentRect: { width: 1100 } }])
      }
      disconnect(): void {}
    },
  )
  backend(
    timesheetView(),
    [],
    [{ ticketKey: 'MDP-7', summary: 'Seven', commits: 2, claude: true, shareMinutes: 480 }],
  )
  renderWithQuery(<TimesheetPage />)
  await screen.findByRole('group', { name: /THU 12/ })
  expect(
    await within(card(/THU 12/)).findByRole('button', { name: /MDP-7 2 commits/ }),
  ).toBeInTheDocument()
  expect(screen.getAllByRole('button', { name: /MDP-7 2 commits/ })).toHaveLength(1)
})

it('a server that has no week yet is asked to read it, even when the page was visited before', async () => {
  const fetchMock = backend(timesheetView({ week: null }))
  renderWithQuery(<TimesheetPage />)
  await waitFor(() => {
    expect(callsTo(fetchMock, '/api/timesheet/week')).toBe(1)
  })
})
it('Read again reads with the background browser, and a day with no token says how to read it', async () => {
  const base = timesheetView()
  const week = base.week
  if (week === null || week.coverage === null) {
    throw new Error('fixture has no week')
  }
  const noToken = timesheetView({
    week: {
      ...week,
      coverage: week.coverage.map((day) =>
        day.tscState === 'notDue' ? day : { ...day, tscState: 'noToken' as const },
      ),
    },
  })
  const fetchMock = backend(noToken)
  renderWithQuery(<TimesheetPage />)
  expect(await screen.findByText(/TSC not read yet: Read again reads it/)).toBeInTheDocument()
  fireEvent.click(await screen.findByRole('button', { name: 'Read again' }))
  await waitFor(() => {
    expect(bodyOf(fetchMock, '/api/timesheet/week', 1)).toEqual({
      monday: '2026-11-09',
      allowSniff: true,
    })
  })
})
