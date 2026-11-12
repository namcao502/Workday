import {
  addDays,
  parseTicketKeys,
  reviewWeek,
  tscStateFor,
  type DayCoverage,
  type HoursLog,
  type HrmTask,
  type SheetLog,
  type SheetRead,
  type TicketTracker,
  type WeekReviewItem,
} from '@workday/core'
import { lookUp, type BoardKeys, type MineCache } from './ticketCheck.js'

const WORKDAYS = 5
const NO_HOURS: Readonly<Record<string, number | null>> = {}

export function weekdaysOf(monday: string): readonly string[] {
  return Array.from({ length: WORKDAYS }, (_, index) => addDays(monday, index))
}

async function readSheet(
  sheet: SheetLog | null,
  readable: readonly string[],
  allowSniff: boolean,
): Promise<SheetRead> {
  if (sheet === null) {
    return { kind: 'noToken' }
  }
  if (readable.length === 0) {
    return { kind: 'read', cells: {} }
  }
  try {
    return await sheet.readTickets(readable, { allowSniff })
  } catch (error: unknown) {
    return { kind: 'failed', detail: error instanceof Error ? error.message : String(error) }
  }
}

// Off dates cover the whole week so a planned day off ahead reads "off", not pending.
export async function readCoverage(
  sheet: SheetLog | null,
  hours: HoursLog | null,
  monday: string,
  today: string,
  allowSniff: boolean,
): Promise<readonly DayCoverage[]> {
  const weekdays = weekdaysOf(monday)
  const readable = weekdays.filter((date) => date <= today)
  const [tscRead, dayHours, offDates] = await Promise.all([
    readSheet(sheet, readable, allowSniff),
    hours === null ? NO_HOURS : hours.dayHours(readable),
    hours === null ? [] : hours.offDates(monday, addDays(monday, WORKDAYS - 1)),
  ])
  const cells = tscRead.kind === 'read' ? tscRead.cells : null
  const hadToken = tscRead.kind !== 'noToken'
  const off = new Set(offDates)
  return weekdays.map((date) => ({
    date,
    hrmHours: dayHours[date] ?? null,
    tscText: cells?.[date] ?? null,
    isOff: off.has(date),
    tscState: tscStateFor(date, today, hadToken, allowSniff, cells),
  }))
}

export interface ReviewSources {
  readonly hours: HoursLog | null
  readonly tracker: TicketTracker | null
  readonly mineCache: MineCache | null
  readonly board: BoardKeys
  readonly projectKey: string | null
  readonly offMarker: string
}

export interface WeekReview {
  readonly review: readonly WeekReviewItem[]
  readonly hrmTasks: readonly HrmTask[] | null
}

// A key Jira could not be asked about counts as the user's: an outage must not read as a week of typos.
async function sortKeys(
  keys: readonly string[],
  sources: ReviewSources,
): Promise<{ readonly mine: ReadonlySet<string>; readonly missing: ReadonlySet<string> }> {
  const known = sources.board.knownKeys()
  const unchecked = keys.filter((key) => !known.has(key))
  const { tracker, mineCache } = sources
  if (tracker === null || mineCache === null) {
    return { mine: new Set([...known, ...unchecked]), missing: new Set() }
  }
  const tickets = await Promise.all(unchecked.map((key) => lookUp(tracker, key)))
  const unreachable = unchecked.filter((_, index) => tickets[index] === undefined)
  const missing = new Set(unchecked.filter((_, index) => tickets[index] === null))
  const existing = unchecked.filter(
    (_, index) => tickets[index] !== undefined && tickets[index] !== null,
  )
  let existingMine: ReadonlySet<string> = new Set()
  if (existing.length !== 0) {
    try {
      existingMine = await mineCache.filterMine(existing)
    } catch {
      existingMine = new Set(existing)
    }
  }
  return { mine: new Set([...known, ...unreachable, ...existingMine]), missing }
}

export async function reviewOf(
  coverage: readonly DayCoverage[],
  monday: string,
  today: string,
  sources: ReviewSources,
): Promise<WeekReview> {
  const readDays = coverage.filter((day) => day.date <= today)
  if (readDays.length === 0) {
    return { review: [], hrmTasks: null }
  }
  const lastDay = readDays[readDays.length - 1]?.date ?? monday
  const hrmTasks = sources.hours === null ? null : await sources.hours.tasks(monday, lastDay)
  const loggedKeys = [
    ...new Set([
      ...readDays.flatMap((day) => parseTicketKeys(day.tscText, sources.projectKey).tickets),
      ...(hrmTasks ?? []).map((task) => task.ticketKey.toUpperCase()),
    ]),
  ]
  const { mine, missing } = await sortKeys(loggedKeys, sources)
  const review = reviewWeek({
    week: readDays,
    hrmTasks,
    mineKeys: mine,
    missingKeys: missing,
    offMarker: sources.offMarker,
    projectKey: sources.projectKey,
  })
  return { review, hrmTasks }
}
