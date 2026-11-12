import { isTicketKey } from './ticketKey.js'
import { evenSplit, HRM_OPENS_AT_MINUTES, WORK_MINUTES } from './timeSlots.js'
import type { ZonedClock } from './zonedDate.js'

export interface QueueEntry {
  readonly date: string
  readonly tickets: readonly string[]
  readonly minutes: readonly number[] | null // null = even split
}

export type QueueAddOutcome =
  | { readonly status: 'added' | 'merged'; readonly queue: readonly QueueEntry[] }
  | { readonly status: 'overEightHours' | 'invalidTicket' }

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0)
}

// The entry's per-ticket minutes, concrete even when it is an even split.
export function entryMinutes(entry: QueueEntry): readonly number[] {
  return entry.minutes ?? evenSplit(entry.tickets.length)
}

// A full day for the even split, the actual sum for a custom entry.
export function dayMinutes(entry: QueueEntry): number {
  return entry.minutes === null ? WORK_MINUTES : sum(entry.minutes)
}

// Appends the tickets not yet present; minutes become concrete only when either side is custom.
export function mergeInto(
  existing: QueueEntry,
  tickets: readonly string[],
  minutes: readonly number[] | null,
): QueueEntry {
  const mergedTickets = [...existing.tickets]
  const isCustom = existing.minutes !== null || minutes !== null
  const mergedMinutes = isCustom ? [...entryMinutes(existing)] : null
  const newMinutes = minutes ?? evenSplit(tickets.length)

  tickets.forEach((ticket, index) => {
    if (mergedTickets.includes(ticket)) {
      return
    }
    mergedTickets.push(ticket)
    mergedMinutes?.push(newMinutes[index] ?? 0)
  })
  return { date: existing.date, tickets: mergedTickets, minutes: mergedMinutes }
}

function sortedByDate(queue: readonly QueueEntry[]): readonly QueueEntry[] {
  return [...queue].sort((left, right) =>
    left.date < right.date ? -1 : left.date > right.date ? 1 : 0,
  )
}

export function addTickets(
  queue: readonly QueueEntry[],
  date: string,
  tickets: readonly string[],
  minutes: readonly number[] | null,
): QueueAddOutcome {
  if (tickets.length === 0 || !tickets.every(isTicketKey)) {
    return { status: 'invalidTicket' }
  }
  const index = queue.findIndex((entry) => entry.date === date)
  const existing = queue[index]
  if (existing === undefined) {
    return {
      status: 'added',
      queue: sortedByDate([...queue, { date, tickets: [...tickets], minutes }]),
    }
  }
  const merged = mergeInto(existing, tickets, minutes)
  if (dayMinutes(merged) > WORK_MINUTES) {
    return { status: 'overEightHours' }
  }
  return {
    status: 'merged',
    queue: sortedByDate(queue.map((entry, at) => (at === index ? merged : entry))),
  }
}

// Drops the ticket set from one entry, keeping minutes aligned; null when no ticket is left.
function withoutTickets(entry: QueueEntry, dropped: ReadonlySet<string>): QueueEntry | null {
  const kept = entry.tickets.flatMap((ticket, index) =>
    dropped.has(ticket) ? [] : [{ ticket, minutes: entry.minutes?.[index] ?? 0 }],
  )
  if (kept.length === 0) {
    return null
  }
  return {
    date: entry.date,
    tickets: kept.map((item) => item.ticket),
    minutes: entry.minutes === null ? null : kept.map((item) => item.minutes),
  }
}

// Runs on the current queue: only each date's processed tickets go, so tickets queued meanwhile survive.
export function removeLogged(
  queue: readonly QueueEntry[],
  processed: readonly QueueEntry[],
): readonly QueueEntry[] {
  return queue.flatMap((entry) => {
    const dropped = new Set(
      processed.filter((item) => item.date === entry.date).flatMap((item) => item.tickets),
    )
    if (dropped.size === 0) {
      return [entry]
    }
    const remaining = withoutTickets(entry, dropped)
    return remaining === null ? [] : [remaining]
  })
}

export function removeTicket(
  queue: readonly QueueEntry[],
  date: string,
  ticket: string,
): readonly QueueEntry[] {
  return removeLogged(queue, [{ date, tickets: [ticket], minutes: null }])
}

// One ticket's share changed; null when the ticket is absent, the share is 0 or the day would pass 8h.
export function minutesWith(
  entry: QueueEntry,
  ticket: string,
  ticketMinutes: number,
): readonly number[] | null {
  const index = entry.tickets.indexOf(ticket)
  if (index < 0 || ticketMinutes <= 0) {
    return null
  }
  const minutes = entryMinutes(entry).map((value, at) => (at === index ? ticketMinutes : value))
  return sum(minutes) <= WORK_MINUTES ? minutes : null
}

// Custom minutes given per ticket in any order; null unless the entry holds exactly these tickets.
export function setMinutes(
  queue: readonly QueueEntry[],
  date: string,
  tickets: readonly string[],
  minutes: readonly number[],
): readonly QueueEntry[] | null {
  if (tickets.length !== minutes.length) {
    throw new Error('One minutes value per ticket.')
  }
  const index = queue.findIndex((entry) => entry.date === date)
  const existing = queue[index]
  if (
    existing === undefined ||
    existing.tickets.length !== tickets.length ||
    !existing.tickets.every((ticket) => tickets.includes(ticket))
  ) {
    return null
  }
  const ordered = existing.tickets.map((ticket) => minutes[tickets.indexOf(ticket)] ?? 0)
  return queue.map((entry, at) => (at === index ? { ...entry, minutes: ordered } : entry))
}

// Today can only be logged once HRM opens, or at the log time when that is later.
export function isTodayDue(clock: ZonedClock, logTimeMinutes: number): boolean {
  return clock.minutes >= Math.max(logTimeMinutes, HRM_OPENS_AT_MINUTES)
}

export function queueDayState(
  date: string,
  clock: ZonedClock,
  logTimeMinutes: number,
): 'waiting' | 'due' {
  const isDue = date < clock.date || (date === clock.date && isTodayDue(clock, logTimeMinutes))
  return isDue ? 'due' : 'waiting'
}

export function minutesUntilRun(clock: ZonedClock, logTimeMinutes: number): number {
  return Math.max(0, Math.max(logTimeMinutes, HRM_OPENS_AT_MINUTES) - clock.minutes)
}

// HRM rejects a stop time in the future, so today is closed before 18:00.
export function isHrmClosed(date: string, clock: ZonedClock): boolean {
  return date === clock.date && clock.minutes < HRM_OPENS_AT_MINUTES
}
