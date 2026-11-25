import {
  addDays,
  holidayOn,
  type Holiday,
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
  type WeekStep,
  type WeekStepId,
} from '@workday/core'
import { lookUp, type BoardKeys, type MineCache } from './ticketCheck.js'

const WORKDAYS = 5

// Told as each part of a week read starts and ends, so the page can say what it waits for.
export type StepReporter = (id: WeekStepId, state: WeekStep['state']) => void
const IGNORE_STEP: StepReporter = () => undefined

// Runs one part of the read and reports it; a failure is reported and then thrown on as before.
async function inStep<Result>(
  report: StepReporter,
  id: WeekStepId,
  run: () => Promise<Result>,
  failed: (result: Result) => boolean = () => false,
): Promise<Result> {
  report(id, 'running')
  try {
    const result = await run()
    report(id, failed(result) ? 'failed' : 'done')
    return result
  } catch (error: unknown) {
    report(id, 'failed')
    throw error
  }
}
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
  holidays: readonly Holiday[],
  monday: string,
  today: string,
  allowSniff: boolean,
  logError: (message: string, error: unknown) => void,
  report: StepReporter = IGNORE_STEP,
): Promise<readonly DayCoverage[]> {
  const weekdays = weekdaysOf(monday)
  const readable = weekdays.filter((date) => date <= today)
  const [tscRead, dayHours, offDates] = await Promise.all([
    sheet === null
      ? readSheet(sheet, readable, allowSniff)
      : inStep(
          report,
          'tsc',
          () => readSheet(sheet, readable, allowSniff),
          (read) => read.kind === 'failed',
        ),
    hours === null ? NO_HOURS : inStep(report, 'hrmHours', () => hours.dayHours(readable)),
    hours === null
      ? []
      : inStep(report, 'hrmOff', () => hours.offDates(monday, addDays(monday, WORKDAYS - 1))),
  ])
  // The day cards only show "failed", so the reason goes to the log.
  if (tscRead.kind === 'failed') {
    logError('Reading TSC failed', tscRead.detail)
  }
  const cells = tscRead.kind === 'read' ? tscRead.cells : null
  const hadToken = tscRead.kind !== 'noToken'
  const off = new Set(offDates)
  return weekdays.map((date) => {
    const holiday = holidayOn(date, holidays)
    return {
      date,
      hrmHours: dayHours[date] ?? null,
      tscText: cells?.[date] ?? null,
      isOff: off.has(date) || holiday !== null,
      holiday,
      tscState: tscStateFor(date, today, hadToken, allowSniff, cells),
    }
  })
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
  report: StepReporter,
): Promise<{ readonly mine: ReadonlySet<string>; readonly missing: ReadonlySet<string> }> {
  const known = sources.board.knownKeys()
  const unchecked = keys.filter((key) => !known.has(key))
  const { tracker, mineCache } = sources
  if (tracker === null || mineCache === null || unchecked.length === 0) {
    report('jira', 'done')
    return { mine: new Set([...known, ...unchecked]), missing: new Set() }
  }
  report('jira', 'running')
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
  report('jira', 'done')
  return { mine: new Set([...known, ...unreachable, ...existingMine]), missing }
}

export async function reviewOf(
  coverage: readonly DayCoverage[],
  monday: string,
  today: string,
  sources: ReviewSources,
  report: StepReporter = IGNORE_STEP,
): Promise<WeekReview> {
  const readDays = coverage.filter((day) => day.date <= today)
  if (readDays.length === 0) {
    return { review: [], hrmTasks: null }
  }
  const lastDay = readDays[readDays.length - 1]?.date ?? monday
  const { hours } = sources
  const hrmTasks =
    hours === null ? null : await inStep(report, 'hrmTasks', () => hours.tasks(monday, lastDay))
  const loggedKeys = [
    ...new Set([
      ...readDays.flatMap((day) => parseTicketKeys(day.tscText, sources.projectKey).tickets),
      ...(hrmTasks ?? []).map((task) => task.ticketKey.toUpperCase()),
    ]),
  ]
  const { mine, missing } = await sortKeys(loggedKeys, sources, report)
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
