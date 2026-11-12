import { describe, expect, it } from 'vitest'
import type { QueueEntry } from './timesheetQueue.js'
import {
  buildLogDays,
  hrmWeekTotal,
  tscStateFor,
  weekTicketTotals,
  type DayCoverage,
  type HrmTask,
  type LogDayView,
} from './timesheetWeek.js'

const MONDAY = '2026-11-02'
const WEDNESDAY = '2026-11-04'
const FRIDAY = '2026-11-06'
const WEEKDAYS = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06']

function coverage(date: string, hrmHours: number | null, isOff = false): DayCoverage {
  return { date, hrmHours, tscText: null, isOff, tscState: 'read' }
}

function dayOf(
  date: string,
  coverages: readonly DayCoverage[] | null,
  queue: readonly QueueEntry[],
): LogDayView {
  const view = buildLogDays(WEEKDAYS, coverages, queue, FRIDAY).find((day) => day.date === date)
  if (view === undefined) {
    throw new Error('day missing')
  }
  return view
}

const entry: QueueEntry = { date: MONDAY, tickets: ['MDP-1'], minutes: null }

describe('buildLogDays', () => {
  it('marks an off day', () => {
    const off = coverage(MONDAY, 0, true)
    const view = dayOf(MONDAY, [off], [])
    expect(view.state).toBe('off')
    expect(view.coverage).toEqual(off)
  })

  it('marks a logged day when HRM hours are positive', () => {
    expect(dayOf(MONDAY, [coverage(MONDAY, 8)], []).state).toBe('logged')
  })

  it('marks a queued day and the queue beats logged', () => {
    const queued = dayOf(MONDAY, [], [entry])
    expect(queued.state).toBe('queued')
    expect(queued.queued).toEqual(entry)
    expect(dayOf(MONDAY, [coverage(MONDAY, 8)], [entry]).state).toBe('queued')
  })

  it('lets off beat queued', () => {
    expect(dayOf(MONDAY, [coverage(MONDAY, 0, true)], [entry]).state).toBe('off')
  })

  it('marks empty when nothing is logged', () => {
    expect(dayOf(MONDAY, [coverage(MONDAY, 0)], []).state).toBe('empty')
    expect(dayOf(MONDAY, [coverage(MONDAY, null)], []).state).toBe('empty')
  })

  it('treats missing coverage as not logged', () => {
    const view = dayOf(MONDAY, [], [])
    expect(view.state).toBe('empty')
    expect(view.coverage).toBeNull()
    expect(dayOf(MONDAY, null, []).state).toBe('empty')
    expect(dayOf(MONDAY, null, [entry]).state).toBe('queued')
  })

  it('lists every weekday Monday first with the days to come as future', () => {
    const queue: QueueEntry[] = [{ date: FRIDAY, tickets: ['MDP-1'], minutes: null }]
    const week = buildLogDays(WEEKDAYS, [], queue, WEDNESDAY)
    expect(week.map((day) => day.date)).toEqual(WEEKDAYS)
    expect(week.map((day) => day.state)).toEqual(['empty', 'empty', 'empty', 'future', 'future'])
    expect(week[4]?.queued).toBeNull()
  })
})

describe('tscStateFor', () => {
  it('is notDue for a future day', () => {
    expect(tscStateFor(FRIDAY, WEDNESDAY, true, true, { [FRIDAY]: 'x' })).toBe('notDue')
  })

  it('is noToken without a sniff and failed after one', () => {
    expect(tscStateFor(MONDAY, FRIDAY, false, false, null)).toBe('noToken')
    expect(tscStateFor(MONDAY, FRIDAY, false, true, null)).toBe('failed')
  })

  it('is failed for a date missing from the cells', () => {
    expect(tscStateFor(MONDAY, FRIDAY, true, true, {})).toBe('failed')
    expect(tscStateFor(MONDAY, FRIDAY, true, true, null)).toBe('failed')
    expect(tscStateFor(MONDAY, FRIDAY, true, true, { [MONDAY]: null })).toBe('read')
  })
})

describe('hrmWeekTotal', () => {
  it('leaves days off out of the target', () => {
    const week = [coverage(MONDAY, 8), coverage('2026-11-03', 0, true), coverage(WEDNESDAY, 4)]
    expect(hrmWeekTotal(week, WEDNESDAY)).toEqual({ hours: 12, targetHours: 32, isWeekOver: false })
  })

  it('is over once today passes Friday', () => {
    expect(hrmWeekTotal([coverage(MONDAY, 8)], '2026-11-07').isWeekOver).toBe(true)
    expect(hrmWeekTotal([coverage(MONDAY, 8)], FRIDAY).isWeekOver).toBe(false)
  })
})

describe('weekTicketTotals', () => {
  it('counts a queued day from the queue, not HRM', () => {
    const hrm: HrmTask[] = [
      { date: MONDAY, ticketKey: 'MDP-9', summary: null, workingSeconds: 28800 },
      { date: WEDNESDAY, ticketKey: 'MDP-2', summary: null, workingSeconds: 3600 },
      { date: WEDNESDAY, ticketKey: 'MDP-3', summary: null, workingSeconds: 7200 },
    ]
    const totals = weekTicketTotals(hrm, [entry], WEEKDAYS)
    expect(totals).toEqual([
      { key: 'MDP-1', minutes: 480 },
      { key: 'MDP-3', minutes: 120 },
      { key: 'MDP-2', minutes: 60 },
    ])
  })

  it('works from the queue alone when HRM was not read', () => {
    expect(weekTicketTotals(null, [entry], WEEKDAYS)).toEqual([{ key: 'MDP-1', minutes: 480 }])
  })
})
