import {
  addTickets,
  HRM_OPENS_AT_MINUTES,
  isHrmClosed,
  isTicketKey,
  removeLogged,
  removeTicket,
  setMinutes,
  WORK_MINUTES,
  zonedClock,
  type AppError,
  type EntryOutcome,
  type HoursLog,
  type QueueEntry,
  type RunSummary,
  type SheetLog,
  type TicketCheck,
  type TicketTracker,
  type TimesheetView,
  type WeekState,
  type ZonedClock,
} from '@workday/core'
import type { EventSink } from '../events.js'
import { isFullySuccessful, logEntry, sheetStep, type LogTarget } from './logEntry.js'
import { checkTickets, MineCache, type BoardKeys } from './ticketCheck.js'
import { readCoverage, reviewOf } from './weekReader.js'

export interface TimesheetSettings {
  readonly sheet: SheetLog | null
  readonly hours: HoursLog | null
  readonly tracker: TicketTracker | null
  readonly projectKey: string | null
  readonly timeZone: string
  readonly logTime: string
  readonly offMarker: string
}

export interface TimesheetServiceDeps {
  readonly loadQueue: () => readonly QueueEntry[]
  readonly saveQueue: (queue: readonly QueueEntry[]) => Promise<void>
  readonly events: EventSink
  readonly board: BoardKeys
  readonly now: () => Date
  readonly settings: TimesheetSettings
  // Called after each new lastRun, e.g. to push it to phones.
  readonly onRun?: (summary: RunSummary) => void
  readonly logError?: (message: string, error: unknown) => void
}

export interface LogRequest {
  readonly date: string
  readonly tickets: readonly string[]
  readonly minutes: readonly number[] | null
  readonly target: LogTarget
}

export interface Refusal {
  readonly ok: false
  readonly error: AppError
}
export type QueueChange = { readonly ok: true } | Refusal
export type DrainOutcome = { readonly ok: true; readonly summary: RunSummary } | Refusal
export type LogOutcome = { readonly ok: true; readonly outcome: EntryOutcome } | Refusal
export type RunTrigger = RunSummary['trigger']

const DRAIN_DEADLINE_MILLISECONDS = 5 * 60_000
const SATURDAY = 6
const SUNDAY = 0
const HRM_CLOSED: Refusal = { ok: false, error: { code: 'hrmClosedForToday' } }

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0)
}

export class TimesheetService {
  private queue: readonly QueueEntry[]
  private settings: TimesheetSettings
  private mineCache: MineCache | null
  private lastRun: RunSummary | null = null
  private week: WeekState | null = null
  private draining = false
  private redrainPending = false
  private changes: Promise<void> = Promise.resolve()
  private weekReads: Promise<void> = Promise.resolve()
  private readonly logError: (message: string, error: unknown) => void

  constructor(private readonly deps: TimesheetServiceDeps) {
    this.queue = deps.loadQueue()
    this.settings = deps.settings
    this.mineCache = deps.settings.tracker === null ? null : new MineCache(deps.settings.tracker)
    this.logError = deps.logError ?? console.error
  }

  configure(settings: TimesheetSettings): void {
    const previous = this.settings
    this.settings = settings
    if (settings.tracker !== previous.tracker) {
      this.mineCache = settings.tracker === null ? null : new MineCache(settings.tracker)
    }
    const changed = (Object.keys(settings) as (keyof TimesheetSettings)[]).some(
      (key) => settings[key] !== previous[key],
    )
    if (changed) {
      this.broadcast()
    }
  }

  view(): TimesheetView {
    const { sheet, hours, logTime } = this.settings
    return {
      tscConnected: sheet !== null,
      hrmConnected: hours !== null,
      logTime,
      today: this.clock().date,
      queue: this.queue,
      draining: this.draining,
      lastRun: this.lastRun,
      week: this.week,
    }
  }

  addToQueue(
    date: string,
    tickets: readonly string[],
    minutes: readonly number[] | null,
  ): Promise<QueueChange> {
    return this.enqueue(async (): Promise<QueueChange> => {
      if (minutes !== null && sum(minutes) > WORK_MINUTES) {
        return { ok: false, error: { code: 'overEightHours' } }
      }
      const outcome = addTickets(this.queue, date, tickets, minutes)
      if (!('queue' in outcome)) {
        return { ok: false, error: { code: outcome.status } }
      }
      await this.commit(outcome.queue)
      return { ok: true }
    })
  }

  // Start queues the ticket for today in the configured time zone; the minutes split evenly.
  queueToday(tickets: readonly string[]): Promise<QueueChange> {
    return this.addToQueue(this.clock().date, tickets, null)
  }

  setQueueMinutes(
    date: string,
    tickets: readonly string[],
    minutes: readonly number[],
  ): Promise<QueueChange> {
    return this.enqueue(async (): Promise<QueueChange> => {
      if (sum(minutes) > WORK_MINUTES) {
        return { ok: false, error: { code: 'overEightHours' } }
      }
      const next = setMinutes(this.queue, date, tickets, minutes)
      if (next === null) {
        return { ok: false, error: { code: 'invalidTicket' } }
      }
      await this.commit(next)
      return { ok: true }
    })
  }

  removeFromQueue(date: string, key: string): Promise<void> {
    return this.enqueue(async () => {
      const isQueued = this.queue.some((item) => item.date === date && item.tickets.includes(key))
      if (isQueued) {
        await this.commit(removeTicket(this.queue, date, key))
      }
    })
  }

  clearQueue(): Promise<void> {
    return this.enqueue(() => this.commit(this.queue.length === 0 ? this.queue : []))
  }

  // One run at a time; a request during a run asks for one more pass, since the run's snapshot may predate it.
  async drain(trigger: RunTrigger, date?: string): Promise<DrainOutcome> {
    if (date !== undefined && isHrmClosed(date, this.clock())) {
      return HRM_CLOSED
    }
    if (this.draining) {
      this.redrainPending = true
      return { ok: true, summary: { at: this.now(), trigger, kind: 'joined' } }
    }
    this.draining = true
    this.broadcast()
    let summary: RunSummary
    try {
      summary = await this.runDrain(trigger, date)
    } catch (error: unknown) {
      // A failed run (e.g. the queue save) drops the pending pass too, so no stale redrain fires later.
      this.redrainPending = false
      this.logError('The drain failed', error)
      this.broadcast()
      throw error
    } finally {
      this.draining = false
    }
    this.lastRun = summary
    this.broadcast()
    this.deps.onRun?.(summary)
    this.rereadWeek()
    if (this.redrainPending) {
      this.redrainPending = false
      await this.drain(trigger)
    }
    return { ok: true, summary }
  }

  // Logs one day now; the queue is left alone.
  async log(request: LogRequest): Promise<LogOutcome> {
    if (request.tickets.length === 0 || !request.tickets.every(isTicketKey)) {
      return { ok: false, error: { code: 'invalidTicket' } }
    }
    if (request.minutes !== null && sum(request.minutes) > WORK_MINUTES) {
      return { ok: false, error: { code: 'overEightHours' } }
    }
    if (request.target !== 'tsc' && isHrmClosed(request.date, this.clock())) {
      return HRM_CLOSED
    }
    const { sheet, hours } = this.settings
    const entry = { date: request.date, tickets: request.tickets, minutes: request.minutes }
    return { ok: true, outcome: await logEntry(sheet, hours, entry, request.target) }
  }

  // The day's queued tickets go too, so the scheduled drain cannot overwrite OFF.
  async logOff(date: string): Promise<EntryOutcome> {
    const { sheet } = this.settings
    if (sheet === null) {
      const tsc = {
        status: 'failed',
        error: { code: 'timesheetNotConfigured' },
        detail: null,
      } as const
      return { date, tsc, hrm: { status: 'skipped' } }
    }
    const tsc = sheetStep(await sheet.writeOff(date))
    if (tsc.status === 'ok') {
      await this.enqueue(() => {
        const next = this.queue.filter((item) => item.date !== date)
        return this.commit(next.length === this.queue.length ? this.queue : next)
      })
      this.rereadWeek()
    }
    return { date, tsc, hrm: { status: 'skipped' } }
  }

  // The daily fire. A failed leave lookup counts as a working day: nagging is the safe direction.
  async runSchedule(): Promise<void> {
    const { sheet, hours, timeZone } = this.settings
    if (sheet === null && hours === null) {
      this.record('schedule', 'notConfigured')
      return
    }
    if (this.queue.length !== 0) {
      await this.drain('schedule')
      return
    }
    const clock = zonedClock(timeZone, this.deps.now())
    if (clock.weekday === SATURDAY || clock.weekday === SUNDAY) {
      this.record('schedule', 'weekend')
      return
    }
    let offDates: readonly string[] = []
    try {
      offDates = hours === null ? [] : await hours.offDates(clock.date, clock.date)
    } catch (error: unknown) {
      this.logError('HRM leave lookup failed; showing the reminder', error)
    }
    this.record('schedule', offDates.includes(clock.date) ? 'dayOff' : 'reminder')
  }

  // At startup and after a TSC sign-in: a past day, or today once HRM is open, is due now.
  async catchUp(): Promise<void> {
    const { sheet, hours } = this.settings
    if (sheet === null && hours === null) {
      return
    }
    const clock = this.clock()
    const isDue = this.queue.some(
      (item) =>
        item.date < clock.date ||
        (item.date === clock.date && clock.minutes >= HRM_OPENS_AT_MINUTES),
    )
    if (isDue) {
      await this.drain('catchUp')
    }
  }

  // Reads run one after another; a result for a week no longer shown is dropped.
  readWeek(monday: string, allowSniff: boolean): Promise<void> {
    const previous = this.week
    this.week =
      previous !== null && previous.monday === monday
        ? { ...previous, reading: true }
        : { monday, reading: true, coverage: null, review: null, hrmTasks: null, readAt: null }
    this.broadcast()
    const run = this.weekReads.then(() => this.runWeekRead(monday, allowSniff))
    this.weekReads = run.catch(() => undefined)
    return run
  }

  checkTickets(keys: readonly string[]): Promise<readonly TicketCheck[]> {
    return checkTickets(keys, this.deps.board, this.settings.tracker, this.mineCache)
  }

  // Logged days leave the current queue in `finally`, so progress survives an error; tickets queued meanwhile stay.
  private async runDrain(trigger: RunTrigger, date: string | undefined): Promise<RunSummary> {
    const snapshot = this.queue.filter((item) => date === undefined || item.date === date)
    if (snapshot.length === 0) {
      return { at: this.now(), trigger, kind: 'nothingDue' }
    }
    const { sheet, hours } = this.settings
    const deadline = this.deps.now().getTime() + DRAIN_DEADLINE_MILLISECONDS
    const processed: QueueEntry[] = []
    const kept: EntryOutcome[] = []
    let timedOut = false
    try {
      for (const item of snapshot) {
        if (this.deps.now().getTime() >= deadline) {
          timedOut = true
          break
        }
        const outcome = await logEntry(sheet, hours, item, 'both')
        if (isFullySuccessful(outcome)) {
          processed.push(item)
        } else {
          kept.push(outcome)
        }
      }
    } finally {
      if (processed.length !== 0) {
        await this.enqueue(() => this.commit(removeLogged(this.queue, processed)))
      }
    }
    return { at: this.now(), trigger, kind: 'drained', logged: processed.length, kept, timedOut }
  }

  private async runWeekRead(monday: string, allowSniff: boolean): Promise<void> {
    const { sheet, hours, tracker, projectKey, offMarker } = this.settings
    const today = this.clock().date
    const coverage = await readCoverage(sheet, hours, monday, today, allowSniff)
    if (this.week === null || this.week.monday !== monday) {
      return
    }
    this.week = { ...this.week, reading: false, coverage, readAt: this.now() }
    this.broadcast()
    const { review, hrmTasks } = await reviewOf(coverage, monday, today, {
      hours,
      tracker,
      mineCache: this.mineCache,
      board: this.deps.board,
      projectKey,
      offMarker,
    })
    if (this.week.monday === monday) {
      this.week = { ...this.week, review, hrmTasks }
      this.broadcast()
    }
  }

  // Refreshes the week on screen after a write, without opening a browser.
  private rereadWeek(): void {
    if (this.week !== null) {
      this.readWeek(this.week.monday, false).catch((error: unknown) => {
        this.logError('Re-reading the week failed', error)
      })
    }
  }

  private record(
    trigger: RunTrigger,
    kind: 'reminder' | 'weekend' | 'dayOff' | 'notConfigured',
  ): void {
    this.lastRun = { at: this.now(), trigger, kind }
    this.broadcast()
    this.deps.onRun?.(this.lastRun)
  }

  private now(): string {
    return this.deps.now().toISOString()
  }

  private clock(): ZonedClock {
    return zonedClock(this.settings.timeZone, this.deps.now())
  }

  private broadcast(): void {
    this.deps.events.broadcast({ type: 'timesheet.changed' })
  }

  // Runs after every earlier change; a failed change rejects its own caller but never the chain.
  private enqueue<Result>(task: () => Result | Promise<Result>): Promise<Result> {
    const run = this.changes.then(task)
    this.changes = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  // Same object = nothing changed. Saved before it is kept, so a failed save leaves the queue as it was.
  private async commit(next: readonly QueueEntry[]): Promise<void> {
    if (next === this.queue) {
      return
    }
    await this.deps.saveQueue(next)
    this.queue = next
    this.broadcast()
  }
}
