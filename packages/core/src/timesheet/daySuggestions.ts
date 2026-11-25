import { compareTicketKeys } from '../ticket/ticketKey.js'
import { WORK_MINUTES } from './timeSlots.js'

// Port of TicketActivities / DaySuggestions / TimeSlots.SplitByActivity: the tickets a day's git log and Claude
// transcripts say were worked on, for the Timesheet's "Worked on today". Pure: the server reads the log and the files.

const ACTIVE_SLOT_MINUTES = 5
const SPLIT_STEP_MINUTES = 30
const MS_PER_MINUTE = 60_000

export interface DayTicketActivity {
  readonly ticketKey: string
  readonly commits: number // the user's own commits of the day on the ticket's branch
  readonly claudeLast: string | null // the last Claude transcript write inside the day (ISO), null when none
  readonly activeMinutes: number
}

export interface DaySuggestion {
  readonly ticketKey: string
  readonly summary: string
  readonly commits: number
  readonly claude: boolean
  readonly shareMinutes: number | null // its share of the 8h day by activity; null = no activity to go by
}

export interface StartedTicket {
  readonly key: string
  readonly summary: string
}

// Five-minute slots of the day holding any work, as minutes: 9:02 and 9:04 count once.
export function activeMinutes(timesMs: readonly number[], startMs: number, endMs: number): number {
  const slots = new Set(
    timesMs
      .filter((at) => at >= startMs && at < endMs)
      .map((at) => Math.floor((at - startMs) / MS_PER_MINUTE / ACTIVE_SLOT_MINUTES)),
  )
  return slots.size * ACTIVE_SLOT_MINUTES
}

// The day split by each ticket's active minutes, in half hours: every ticket gets one, the rest go by activity
// (largest remainder, earlier ticket first on a tie). Null when there is nothing to go by.
export function splitByActivity(active: readonly number[]): readonly number[] | null {
  const totalSteps = WORK_MINUTES / SPLIT_STEP_MINUTES
  const totalActive = active.reduce((sum, minutes) => sum + minutes, 0)
  if (active.length === 0 || active.length > totalSteps || totalActive <= 0) {
    return null
  }
  const freeSteps = totalSteps - active.length
  const shares = active.map((minutes) => (freeSteps * minutes) / totalActive)
  const steps = shares.map((share) => 1 + Math.floor(share))
  const leftover = totalSteps - steps.reduce((sum, step) => sum + step, 0)
  const byRemainder = shares
    .map((share, index) => ({ index, remainder: share - Math.floor(share) }))
    .sort((left, right) => right.remainder - left.remainder || left.index - right.index)
  for (const { index } of byRemainder.slice(0, leftover)) {
    steps[index] = (steps[index] ?? 0) + 1
  }
  return steps.map((step) => step * SPLIT_STEP_MINUTES)
}

// Started tickets with work today that the day does not hold yet, the busiest first.
export function selectDaySuggestions(
  started: readonly StartedTicket[],
  activity: Readonly<Record<string, DayTicketActivity>>,
  excludedKeys: ReadonlySet<string>,
): readonly DaySuggestion[] {
  const excluded = new Set([...excludedKeys].map((key) => key.toUpperCase()))
  const active = started.flatMap((ticket) => {
    const found = activity[ticket.key]
    const isActive = found !== undefined && (found.commits > 0 || found.claudeLast !== null)
    return isActive && !excluded.has(ticket.key.toUpperCase()) ? [{ ticket, found }] : []
  })
  const ordered = [...active].sort(
    (left, right) =>
      right.found.activeMinutes - left.found.activeMinutes ||
      compareTicketKeys(left.ticket.key, right.ticket.key),
  )
  const shares = splitByActivity(ordered.map((item) => item.found.activeMinutes))
  return ordered.map(({ ticket, found }, index) => ({
    ticketKey: ticket.key,
    summary: ticket.summary,
    commits: found.commits,
    claude: found.claudeLast !== null,
    shareMinutes: shares?.[index] ?? null,
  }))
}
