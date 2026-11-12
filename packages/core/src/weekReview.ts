import { parseTicketKeys } from './ticketKey.js'
import { typoNeighbors } from './ticketTypos.js'
import type { DayCoverage, HrmTask } from './timesheetWeek.js'

export type WeekReviewIssue = 'notFound' | 'notMine' | 'tscOnly' | 'hrmOnly'

export interface WeekReviewItem {
  readonly date: string
  readonly ticketKey: string
  readonly summary: string | null
  readonly issue: WeekReviewIssue
  readonly suggestedKey: string | null
}

export interface WeekReviewInput {
  readonly week: readonly DayCoverage[]
  readonly hrmTasks: readonly HrmTask[] | null // null = HRM not read: only the TSC side is checked
  readonly mineKeys: ReadonlySet<string>
  readonly missingKeys: ReadonlySet<string>
  readonly offMarker: string
  readonly projectKey: string | null
}

function containsKey(keys: readonly string[], key: string): boolean {
  const upper = key.toUpperCase()
  return keys.some((item) => item.toUpperCase() === upper)
}

function setHasKey(keys: ReadonlySet<string>, key: string): boolean {
  const upper = key.toUpperCase()
  return [...keys].some((item) => item.toUpperCase() === upper)
}

function uniqueKeys(keys: readonly string[]): readonly string[] {
  return keys.filter(
    (key, index) => keys.findIndex((other) => other.toUpperCase() === key.toUpperCase()) === index,
  )
}

function reviewDay(input: WeekReviewInput, day: DayCoverage): readonly WeekReviewItem[] {
  const isOff =
    day.isOff || (day.tscText ?? '').trim().toUpperCase() === input.offMarker.toUpperCase()
  const tscKeys = parseTicketKeys(day.tscText, input.projectKey).tickets
  const dayTasks = (input.hrmTasks ?? []).filter((task) => task.date === day.date)
  const hrmKeys = dayTasks.map((task) => task.ticketKey)
  const isCompared = day.tscState === 'read' && input.hrmTasks !== null && !isOff
  const items: WeekReviewItem[] = []

  for (const ticketKey of uniqueKeys([...tscKeys, ...hrmKeys])) {
    const summary =
      dayTasks.find((task) => task.ticketKey.toUpperCase() === ticketKey.toUpperCase())?.summary ??
      null
    const isMissing = setHasKey(input.missingKeys, ticketKey)
    if (isMissing || !setHasKey(input.mineKeys, ticketKey)) {
      items.push({
        date: day.date,
        ticketKey,
        summary,
        issue: isMissing ? 'notFound' : 'notMine',
        suggestedKey: typoNeighbors(ticketKey, input.mineKeys)[0] ?? null,
      })
    }
    if (!isCompared) {
      continue
    }
    const isInTsc = containsKey(tscKeys, ticketKey)
    if (isInTsc !== containsKey(hrmKeys, ticketKey)) {
      items.push({
        date: day.date,
        ticketKey,
        summary,
        issue: isInTsc ? 'tscOnly' : 'hrmOnly',
        suggestedKey: null,
      })
    }
  }
  return items
}

// Tickets that are not the user's or do not exist (a likely typo), and tickets in only one of TSC and HRM.
export function reviewWeek(input: WeekReviewInput): readonly WeekReviewItem[] {
  return input.week.flatMap((day) => reviewDay(input, day))
}
