import {
  addTicket,
  applyAssignedPoll,
  applyLiveTickets,
  dismiss,
  dueUrgency,
  markDone,
  offPollKeys,
  parseTicketKey,
  reopen,
  restore,
  todayIn,
  type AddTicketResult,
  type BoardAction,
  type BoardRow,
  type BoardSection,
  type BoardState,
  type BoardView,
  type JiraConfig,
  type LastPoll,
  type Ticket,
  type TicketTracker,
} from '@workday/core'
import type { EventSink } from '../events.js'

export interface BoardSettings {
  readonly jira: JiraConfig | null
  readonly tracker: TicketTracker | null // null while Jira is not configured or has no token
  readonly timeZone: string
}

export interface BoardServiceDeps {
  readonly initialState: BoardState
  readonly save: (state: BoardState) => Promise<void>
  readonly events: EventSink
  readonly settings: BoardSettings
  readonly now?: () => Date
  readonly logError?: (message: string, error: unknown) => void
}

const ACTIONS: Readonly<Record<BoardAction, (state: BoardState, key: string) => BoardState>> = {
  done: markDone,
  reopen,
  dismiss,
  restore,
}

const SECTIONS: readonly BoardSection[] = ['new', 'inProgress', 'done']

function logToConsole(message: string, error: unknown): void {
  console.error(message, error)
}

export class BoardService {
  private state: BoardState
  private settings: BoardSettings
  private lastPoll: LastPoll | null = null
  private queue: Promise<void> = Promise.resolve()
  private runningPoll: { readonly tracker: TicketTracker; readonly done: Promise<void> } | null =
    null
  private readonly save: (state: BoardState) => Promise<void>
  private readonly events: EventSink
  private readonly now: () => Date
  private readonly logError: (message: string, error: unknown) => void

  constructor(deps: BoardServiceDeps) {
    this.state = deps.initialState
    this.settings = deps.settings
    this.save = deps.save
    this.events = deps.events
    this.now = deps.now ?? (() => new Date())
    this.logError = deps.logError ?? logToConsole
  }

  configure(settings: BoardSettings): void {
    const previous = this.settings
    this.settings = settings
    const changed =
      previous.jira !== settings.jira ||
      previous.tracker !== settings.tracker ||
      previous.timeZone !== settings.timeZone
    if (changed) {
      this.events.broadcast({ type: 'board.changed' })
    }
  }

  isConnected(): boolean {
    return this.settings.tracker !== null
  }

  view(): BoardView {
    const today = todayIn(this.settings.timeZone, this.now())
    const toRow = (ticket: Ticket, section: BoardRow['section']): BoardRow => ({
      ticket,
      section,
      dueUrgency: dueUrgency(ticket, today),
      url: this.ticketUrl(ticket.key),
    })
    const listRows = SECTIONS.flatMap((section) =>
      Object.values(this.state[section]).map((ticket) => toRow(ticket, section)),
    )
    const dismissedRows = Object.values(this.state.dismissed).map((entry) =>
      toRow(entry.ticket, 'dismissed'),
    )
    return {
      connected: this.isConnected(),
      lastPoll: this.lastPoll,
      today,
      rows: [...listRows, ...dismissedRows],
    }
  }

  // Every key on the board, dismissed ones included: the user's own tickets for the timesheet checks.
  knownKeys(): ReadonlySet<string> {
    const listKeys = SECTIONS.flatMap((section) => Object.keys(this.state[section]))
    return new Set([...listKeys, ...Object.keys(this.state.dismissed)])
  }

  summaryOf(key: string): string | null {
    for (const section of SECTIONS) {
      const ticket = this.state[section][key]
      if (ticket !== undefined) {
        return ticket.summary
      }
    }
    return this.state.dismissed[key]?.ticket.summary ?? null
  }

  // A poll asked for while one runs on the same tracker shares it, so Jira is called once.
  poll(): Promise<void> {
    const { jira, tracker } = this.settings
    if (jira === null || tracker === null) {
      return Promise.resolve()
    }
    if (this.runningPoll?.tracker === tracker) {
      return this.runningPoll.done
    }
    const running = {
      tracker,
      done: this.runPoll(jira, tracker).finally(() => {
        if (this.runningPoll === running) {
          this.runningPoll = null
        }
      }),
    }
    this.runningPoll = running
    return running.done
  }

  async add(input: string): Promise<AddTicketResult> {
    const { jira, tracker } = this.settings
    if (jira === null || tracker === null) {
      return { ok: false, error: { code: 'notConnected' } }
    }
    const key = parseTicketKey(input, jira.projectKey)
    if (key === null) {
      return { ok: false, error: { code: 'invalidKey' } }
    }
    if (this.isOnBoard(key)) {
      return { ok: false, error: { code: 'alreadyOnBoard', key } }
    }
    let ticket: Ticket | null
    try {
      ticket = await tracker.getTicket(key)
    } catch (error: unknown) {
      this.logError(`Jira lookup of ${key} failed`, error)
      return { ok: false, error: { code: 'jiraUnreachable' } }
    }
    if (ticket === null) {
      return { ok: false, error: { code: 'notFound', key } }
    }
    return this.enqueue(async (): Promise<AddTicketResult> => {
      // The ticket came from a tracker that was replaced or removed while it was fetched.
      if (this.settings.tracker !== tracker) {
        const code = this.settings.tracker === null ? 'notConnected' : 'jiraUnreachable'
        return { ok: false, error: { code } }
      }
      const next = addTicket(this.state, ticket)
      if (next === null) {
        return { ok: false, error: { code: 'alreadyOnBoard', key } }
      }
      await this.commit(next)
      return { ok: true }
    })
  }

  async act(key: string, action: BoardAction): Promise<void> {
    await this.enqueue(() => this.commit(ACTIONS[action](this.state, key)))
  }

  // Each step re-checks the tracker: a result from a Jira replaced mid-poll is dropped.
  private async runPoll(jira: JiraConfig, tracker: TicketTracker): Promise<void> {
    let assigned: Readonly<Record<string, Ticket>>
    try {
      assigned = await tracker.getAssignedTickets()
    } catch (error: unknown) {
      this.logError('Jira assigned query failed; the board is kept as it was', error)
      await this.recordPollIfCurrent(tracker, false)
      return
    }
    try {
      // Jira is awaited outside the queue; only applying each result waits in it.
      const offPoll = await this.enqueue(async () => {
        if (this.settings.tracker !== tracker) {
          return null
        }
        await this.commit(applyAssignedPoll(this.state, assigned, jira.statusFlow))
        return offPollKeys(this.state, assigned)
      })
      if (offPoll === null) {
        return
      }
      const live = await this.fetchLive(tracker, offPoll)
      await this.enqueue(async () => {
        if (this.settings.tracker === tracker) {
          await this.commit(applyLiveTickets(this.state, live))
          this.recordPoll(true)
        }
      })
    } catch (error: unknown) {
      this.logError('Saving the polled board failed', error)
      await this.recordPollIfCurrent(tracker, false)
    }
  }

  private recordPollIfCurrent(tracker: TicketTracker, ok: boolean): Promise<void> {
    return this.enqueue(() => {
      if (this.settings.tracker === tracker) {
        this.recordPoll(ok)
      }
    })
  }

  // A key that fails is skipped (and logged) so one bad ticket does not stop the rest.
  private async fetchLive(
    tracker: TicketTracker,
    keys: readonly string[],
  ): Promise<Readonly<Record<string, Ticket>>> {
    const results = await Promise.allSettled(keys.map((key) => tracker.getTicket(key)))
    const live: Record<string, Ticket> = {}
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        this.logError(
          `Jira lookup of ${keys[index] ?? ''} failed; skipped this poll`,
          result.reason,
        )
      } else if (result.value !== null) {
        live[result.value.key] = result.value
      }
    })
    return live
  }

  private recordPoll(ok: boolean): void {
    this.lastPoll = {
      at: this.now().toISOString(),
      ok,
      error: ok ? null : { code: 'pollFailed' },
    }
    this.events.broadcast({ type: 'board.changed' })
  }

  // Runs after every earlier task; a failed task rejects its own caller but never the chain.
  private enqueue<Result>(task: () => Result | Promise<Result>): Promise<Result> {
    const run = this.queue.then(task)
    this.queue = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  // Same object = nothing changed. Saved before it is kept, so a failed save leaves the board as it was.
  private async commit(next: BoardState): Promise<void> {
    if (next === this.state) {
      return
    }
    await this.save(next)
    this.state = next
    this.events.broadcast({ type: 'board.changed' })
  }

  private isOnBoard(key: string): boolean {
    return (
      SECTIONS.some((section) => Object.hasOwn(this.state[section], key)) ||
      Object.hasOwn(this.state.dismissed, key)
    )
  }

  private ticketUrl(key: string): string {
    const { jira, tracker } = this.settings
    if (tracker !== null) {
      return tracker.ticketUrl(key)
    }
    return jira === null ? '' : `${jira.baseUrl.replace(/\/+$/, '')}/browse/${key}`
  }
}
