import type { QueueEntry, ServerEvent, SheetRead } from '@workday/core'
import { describe, expect, it } from 'vitest'
import { deferred, FakeHoursLog, FakeSheetLog, FakeTracker, makeTicket } from '../testing/fakes.js'
import { TimesheetService, type TimesheetSettings } from './timesheetService.js'

// Asia/Ho_Chi_Minh is UTC+7; 2026-11-11 is a Wednesday.
const WEDNESDAY_10AM = '2026-11-11T03:00:00Z'
const WEDNESDAY_7PM = '2026-11-11T12:00:00Z'
const SATURDAY_7PM = '2026-11-14T12:00:00Z'
const MONDAY = '2026-11-09'

function entry(date: string, ...tickets: string[]): QueueEntry {
  return { date, tickets, minutes: null }
}

interface Setup {
  readonly service: TimesheetService
  readonly sheet: FakeSheetLog
  readonly hours: FakeHoursLog
  readonly tracker: FakeTracker
  readonly events: ServerEvent[]
  readonly saves: (readonly QueueEntry[])[]
  readonly clock: { now: Date }
  readonly saveFailure: { error: Error | null }
}

function setup(
  options: {
    queue?: readonly QueueEntry[]
    now?: string
    boardKeys?: readonly string[]
    settings?: Partial<TimesheetSettings>
  } = {},
): Setup {
  const sheet = new FakeSheetLog()
  const hours = new FakeHoursLog()
  const tracker = new FakeTracker()
  const events: ServerEvent[] = []
  const saves: (readonly QueueEntry[])[] = []
  const saveFailure: { error: Error | null } = { error: null }
  const clock = { now: new Date(options.now ?? WEDNESDAY_7PM) }
  const boardKeys = new Set(options.boardKeys ?? [])
  const service = new TimesheetService({
    loadQueue: () => options.queue ?? [],
    saveQueue: (queue) => {
      if (saveFailure.error !== null) {
        return Promise.reject(saveFailure.error)
      }
      saves.push(queue)
      return Promise.resolve()
    },
    events: { broadcast: (event) => events.push(event) },
    board: {
      knownKeys: () => boardKeys,
      summaryOf: (key) => (boardKeys.has(key) ? `Board ${key}` : null),
    },
    now: () => clock.now,
    logError: () => undefined,
    settings: {
      sheet,
      hours,
      tracker,
      projectKey: 'MDP',
      timeZone: 'Asia/Ho_Chi_Minh',
      logTime: '18:00',
      offMarker: 'OFF',
      ...options.settings,
    },
  })
  return { service, sheet, hours, tracker, events, saves, clock, saveFailure }
}

describe('TimesheetService drain', () => {
  it('a drain removes only the days that succeeded on both sides', async () => {
    const { service, hours } = setup({
      queue: [entry('2026-11-09', 'MDP-1'), entry('2026-11-10', 'MDP-2')],
    })
    hours.log = (date) =>
      Promise.resolve(date === '2026-11-10' ? { ok: false, detail: 'HRM said no' } : { ok: true })

    const result = await service.drain('user')

    expect(result).toMatchObject({
      ok: true,
      summary: { kind: 'drained', trigger: 'user', logged: 1, timedOut: false },
    })
    expect(result.ok && result.summary.kind === 'drained' ? result.summary.kept : []).toEqual([
      {
        date: '2026-11-10',
        tsc: { status: 'ok' },
        hrm: { status: 'failed', error: { code: 'hrmRejected' }, detail: 'HRM said no' },
      },
    ])
    expect(service.view().queue).toEqual([entry('2026-11-10', 'MDP-2')])
    expect(service.view().lastRun).toMatchObject({ kind: 'drained', logged: 1 })
  })

  it('a ticket queued during a drain survives the drain', async () => {
    const { service, hours } = setup({ queue: [entry('2026-11-09', 'MDP-1')] })
    const held = deferred<{ ok: true }>()
    hours.log = () => held.promise

    const draining = service.drain('user')
    await Promise.resolve()
    expect(await service.addToQueue('2026-11-09', ['MDP-5'], null)).toEqual({ ok: true })
    held.resolve({ ok: true })
    await draining

    expect(service.view().queue).toEqual([entry('2026-11-09', 'MDP-5')])
  })

  it('a drain requested during a drain runs one more pass afterwards', async () => {
    const { service, hours } = setup({ queue: [entry('2026-11-09', 'MDP-1')] })
    const held = deferred<{ ok: true }>()
    hours.log = () => held.promise

    const first = service.drain('user')
    await Promise.resolve()
    await service.addToQueue('2026-11-10', ['MDP-2'], null)
    const second = await service.drain('user')
    expect(second).toMatchObject({ ok: true, summary: { kind: 'joined' } })
    expect(service.view().draining).toBe(true)
    held.resolve({ ok: true })
    await first

    expect(hours.logs.map((log) => log.date)).toEqual(['2026-11-09', '2026-11-10'])
    expect(service.view().queue).toEqual([])
    expect(service.view().draining).toBe(false)
  })

  it('a failed drain clears the pending pass and the draining flag', async () => {
    const { service, hours, saveFailure } = setup({
      queue: [entry('2026-11-09', 'MDP-1'), entry('2026-11-10', 'MDP-2')],
    })
    const held = deferred<{ ok: true }>()
    hours.log = () => held.promise

    const first = service.drain('user', '2026-11-09')
    await Promise.resolve()
    await service.drain('user')
    saveFailure.error = new Error('disk full')
    held.resolve({ ok: true })

    await expect(first).rejects.toThrow('disk full')
    expect(service.view().draining).toBe(false)
    saveFailure.error = null
    await service.drain('user', '2026-11-09')
    // A stale pending pass would also have logged the 10th.
    expect(hours.logs.map((log) => log.date)).toEqual(['2026-11-09', '2026-11-09'])
  })

  it('a drain stops at the five minute deadline and keeps the rest', async () => {
    const { service, hours, clock } = setup({
      queue: [
        entry('2026-11-05', 'MDP-1'),
        entry('2026-11-06', 'MDP-2'),
        entry('2026-11-09', 'MDP-3'),
      ],
    })
    hours.log = () => {
      clock.now = new Date(clock.now.getTime() + 5 * 60_000)
      return Promise.resolve({ ok: true })
    }

    const result = await service.drain('schedule')

    expect(result).toMatchObject({ ok: true, summary: { logged: 1, timedOut: true } })
    expect(service.view().queue).toEqual([
      entry('2026-11-06', 'MDP-2'),
      entry('2026-11-09', 'MDP-3'),
    ])
  })
})

describe('TimesheetService log', () => {
  it('log now for today before 18:00 with HRM is refused without calling HRM', async () => {
    const { service, sheet, hours } = setup({ now: WEDNESDAY_10AM })

    const both = await service.log({
      date: '2026-11-11',
      tickets: ['MDP-1'],
      minutes: null,
      target: 'both',
    })
    const hrmOnly = await service.log({
      date: '2026-11-11',
      tickets: ['MDP-1'],
      minutes: null,
      target: 'hrm',
    })
    const drained = await service.drain('user', '2026-11-11')

    const refused = { ok: false, error: { code: 'hrmClosedForToday' } }
    expect([both, hrmOnly, drained]).toEqual([refused, refused, refused])
    expect(hours.logs).toEqual([])
    expect(sheet.writes).toEqual([])
  })

  it('TSC only for today before 18:00 is allowed', async () => {
    const { service, sheet, hours } = setup({ now: WEDNESDAY_10AM })

    const result = await service.log({
      date: '2026-11-11',
      tickets: ['MDP-1', 'MDP-2'],
      minutes: null,
      target: 'tsc',
    })

    expect(result).toEqual({
      ok: true,
      outcome: { date: '2026-11-11', tsc: { status: 'ok' }, hrm: { status: 'skipped' } },
    })
    expect(sheet.writes).toEqual([{ date: '2026-11-11', text: 'MDP-1, MDP-2' }])
    expect(hours.logs).toEqual([])
  })

  it("log off removes that day's queued entry", async () => {
    const { service, sheet } = setup({
      queue: [entry('2026-11-10', 'MDP-1'), entry('2026-11-11', 'MDP-2')],
    })

    const outcome = await service.logOff('2026-11-10')

    expect(outcome).toEqual({
      date: '2026-11-10',
      tsc: { status: 'ok' },
      hrm: { status: 'skipped' },
    })
    expect(sheet.offWrites).toEqual(['2026-11-10'])
    expect(service.view().queue).toEqual([entry('2026-11-11', 'MDP-2')])
  })
})

describe('TimesheetService schedule', () => {
  it('the schedule shows a reminder on a weekday with an empty queue and no leave', async () => {
    const { service, hours } = setup()

    await service.runSchedule()

    expect(service.view().lastRun).toMatchObject({ kind: 'reminder', trigger: 'schedule' })
    expect(hours.offDateCalls).toEqual([{ from: '2026-11-11', to: '2026-11-11' }])
  })

  it('the schedule stays silent on a day off and at the weekend', async () => {
    const dayOff = setup()
    dayOff.hours.offDays = ['2026-11-11']
    const weekend = setup({ now: SATURDAY_7PM })

    await dayOff.service.runSchedule()
    await weekend.service.runSchedule()

    expect(dayOff.service.view().lastRun).toMatchObject({ kind: 'dayOff' })
    expect(weekend.service.view().lastRun).toMatchObject({ kind: 'weekend' })
    expect(weekend.hours.offDateCalls).toEqual([])
  })

  it('catch-up drains a past day at start and does nothing for today before 18:00', async () => {
    const past = setup({ now: WEDNESDAY_10AM, queue: [entry('2026-11-10', 'MDP-1')] })
    const today = setup({ now: WEDNESDAY_10AM, queue: [entry('2026-11-11', 'MDP-2')] })

    await past.service.catchUp()
    await today.service.catchUp()

    expect(past.service.view().lastRun).toMatchObject({ kind: 'drained', trigger: 'catchUp' })
    expect(past.service.view().queue).toEqual([])
    expect(today.service.view().lastRun).toBeNull()
    expect(today.hours.logs).toEqual([])
    expect(today.sheet.writes).toEqual([])
  })
})

describe('TimesheetService week', () => {
  it('readWeek does not sniff when allowSniff is false', async () => {
    const { service, sheet } = setup()

    await service.readWeek(MONDAY, false)

    expect(sheet.reads).toEqual([
      { dates: ['2026-11-09', '2026-11-10', '2026-11-11'], allowSniff: false },
    ])
    const week = service.view().week
    expect(week).toMatchObject({ monday: MONDAY, reading: false, review: [] })
    expect(week?.coverage?.map((day) => day.tscState)).toEqual([
      'read',
      'read',
      'read',
      'notDue',
      'notDue',
    ])
  })

  it('a stale week read does not overwrite the newer week', async () => {
    const { service, sheet } = setup()
    const reads = [deferred<SheetRead>(), deferred<SheetRead>()]
    sheet.read = () => reads[sheet.reads.length - 1]?.promise ?? Promise.reject(new Error('extra'))
    const previousMonday = '2026-11-02'

    const older = service.readWeek(previousMonday, false)
    const newer = service.readWeek(MONDAY, false)
    await Promise.resolve()
    reads[0]?.resolve({ kind: 'read', cells: { '2026-11-02': 'MDP-1' } })
    await older

    expect(service.view().week).toMatchObject({ monday: MONDAY, reading: true, coverage: null })
    reads[1]?.resolve({ kind: 'read', cells: { '2026-11-09': 'MDP-2' } })
    await newer
    expect(service.view().week?.coverage?.[0]).toMatchObject({ date: MONDAY, tscText: 'MDP-2' })
  })

  it('the review does not flag a key Jira could not be asked about', async () => {
    const { service, sheet, hours, tracker } = setup()
    hours.hrmTasks = null
    tracker.failingKeys.add('MDP-70')
    sheet.read = () => Promise.resolve({ kind: 'read', cells: { '2026-11-09': 'MDP-70, MDP-8' } })

    await service.readWeek(MONDAY, false)

    expect(service.view().week?.review).toEqual([
      { date: MONDAY, ticketKey: 'MDP-8', summary: null, issue: 'notFound', suggestedKey: null },
    ])
  })

  it('ticket check suggests a board key one typo away for a ticket that is not mine', async () => {
    const { service, tracker } = setup({ boardKeys: ['MDP-1234'] })
    tracker.live.set('MDP-1243', makeTicket('MDP-1243'))

    const checks = await service.checkTickets(['MDP-1234', 'MDP-1243'])

    expect(checks).toEqual([
      {
        key: 'MDP-1234',
        status: 'valid',
        summary: 'Board MDP-1234',
        isMine: true,
        suggestedKey: null,
      },
      {
        key: 'MDP-1243',
        status: 'valid',
        summary: 'Summary of MDP-1243',
        isMine: false,
        suggestedKey: 'MDP-1234',
      },
    ])
  })
})

describe('TimesheetService queue', () => {
  it('every queue change broadcasts timesheet.changed', async () => {
    const { service, events, saves } = setup()

    await service.addToQueue('2026-11-10', ['MDP-1', 'MDP-2'], null)
    await service.setQueueMinutes('2026-11-10', ['MDP-1', 'MDP-2'], [300, 180])
    await service.removeFromQueue('2026-11-10', 'MDP-1')
    await service.clearQueue()

    expect(saves).toEqual([
      [entry('2026-11-10', 'MDP-1', 'MDP-2')],
      [{ date: '2026-11-10', tickets: ['MDP-1', 'MDP-2'], minutes: [300, 180] }],
      [{ date: '2026-11-10', tickets: ['MDP-2'], minutes: [180] }],
      [],
    ])
    expect(events).toEqual(Array.from({ length: 4 }, () => ({ type: 'timesheet.changed' })))
  })
})
