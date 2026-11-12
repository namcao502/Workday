import { entryMinutes, type QueueEntry } from './timesheetQueue.js'
import { addDays, mondayOf } from './zonedDate.js'

const HOURS_PER_DAY = 8
const WORKDAYS_PER_WEEK = 5

export type TscReadState = 'read' | 'notDue' | 'noToken' | 'failed'

export interface DayCoverage {
  readonly date: string
  readonly hrmHours: number | null
  readonly tscText: string | null
  readonly isOff: boolean
  readonly tscState: TscReadState
}

export interface HrmTask {
  readonly date: string
  readonly ticketKey: string
  readonly summary: string | null
  readonly workingSeconds: number
}

export type LogDayState = 'off' | 'queued' | 'logged' | 'empty' | 'future'

export interface LogDayView {
  readonly date: string
  readonly state: LogDayState
  readonly coverage: DayCoverage | null
  readonly queued: QueueEntry | null
}

function stateOf(
  coverage: DayCoverage | null,
  queued: QueueEntry | null,
): Exclude<LogDayState, 'future'> {
  if (coverage !== null && coverage.isOff) {
    return 'off'
  }
  if (queued !== null) {
    return 'queued'
  }
  if (coverage !== null && coverage.hrmHours !== null && coverage.hrmHours > 0) {
    return 'logged'
  }
  return 'empty'
}

// A day ahead is `future` and keeps no queue entry: its card stays in the queued list.
export function buildLogDays(
  weekdays: readonly string[],
  coverage: readonly DayCoverage[] | null,
  queue: readonly QueueEntry[],
  today: string,
): readonly LogDayView[] {
  return [...weekdays].sort().map((date): LogDayView => {
    if (date > today) {
      return { date, state: 'future', coverage: null, queued: null }
    }
    const dayCoverage = coverage?.find((item) => item.date === date) ?? null
    const queued = queue.find((entry) => entry.date === date) ?? null
    return { date, state: stateOf(dayCoverage, queued), coverage: dayCoverage, queued }
  })
}

// With no token after a sniff attempt it failed; with sniffing off it was simply not tried.
export function tscStateFor(
  date: string,
  today: string,
  hadToken: boolean,
  allowSniff: boolean,
  cells: Readonly<Record<string, string | null>> | null,
): TscReadState {
  if (date > today) {
    return 'notDue'
  }
  if (!hadToken) {
    return allowSniff ? 'failed' : 'noToken'
  }
  return cells !== null && date in cells ? 'read' : 'failed'
}

export function hrmWeekTotal(
  coverage: readonly DayCoverage[],
  today: string,
): { readonly hours: number; readonly targetHours: number; readonly isWeekOver: boolean } {
  const monday = mondayOf(coverage[0]?.date ?? today)
  const friday = addDays(monday, WORKDAYS_PER_WEEK - 1)
  const offDates = new Set(coverage.filter((day) => day.isOff).map((day) => day.date))
  const workdays = Array.from({ length: WORKDAYS_PER_WEEK }, (_, index) => addDays(monday, index))
  const hours = coverage
    .filter((day) => !day.isOff)
    .reduce((total, day) => total + (day.hrmHours ?? 0), 0)
  const offWorkdays = workdays.filter((date) => offDates.has(date)).length
  return {
    hours,
    targetHours: HOURS_PER_DAY * (WORKDAYS_PER_WEEK - offWorkdays),
    isWeekOver: today > friday,
  }
}

// A queued day counts its queue (about to be logged again), any other day the HRM time; most minutes first.
export function weekTicketTotals(
  hrmTasks: readonly HrmTask[] | null,
  queue: readonly QueueEntry[],
  weekdays: readonly string[],
): readonly { readonly key: string; readonly minutes: number }[] {
  const minutesByKey = new Map<string, number>()
  const add = (key: string, minutes: number): void => {
    minutesByKey.set(key, (minutesByKey.get(key) ?? 0) + minutes)
  }
  const queuedDates = new Set<string>()
  for (const entry of queue) {
    if (!weekdays.includes(entry.date)) {
      continue
    }
    queuedDates.add(entry.date)
    const minutes = entryMinutes(entry)
    entry.tickets.forEach((ticket, index) => {
      add(ticket, minutes[index] ?? 0)
    })
  }
  for (const task of hrmTasks ?? []) {
    if (weekdays.includes(task.date) && !queuedDates.has(task.date) && task.workingSeconds > 0) {
      add(task.ticketKey, Math.round(task.workingSeconds / 60))
    }
  }
  return [...minutesByKey]
    .map(([key, minutes]) => ({ key, minutes }))
    .sort((left, right) => right.minutes - left.minutes || (left.key < right.key ? -1 : 1))
}
