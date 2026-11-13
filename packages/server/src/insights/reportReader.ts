import {
  buildReport,
  isTicketKey,
  type AgentStats,
  type BoardState,
  type HrmTask,
  type InsightsView,
  type ReportRange,
  type TicketCommitStats,
  type TicketReportFacts,
  type WorkdayConfig,
} from '@workday/core'
import type { AgentStatsReader } from './agentStatsReader.js'

export type AppConfig = Omit<WorkdayConfig, 'host'>

export interface ReportReaderDeps {
  readonly board: () => BoardState
  readonly config: () => AppConfig
  readonly hrmTasks: (from: string, to: string) => Promise<readonly HrmTask[] | null>
  readonly agent: Pick<AgentStatsReader, 'keys' | 'readAndSave'>
  readonly commits: (
    range: ReportRange,
    config: AppConfig,
  ) => Promise<Readonly<Record<string, TicketCommitStats>>>
  readonly now: () => Date
  readonly logError: (message: string, error: unknown) => void
}

function rangeKey(range: ReportRange): string {
  return `${range.from}|${range.to}`
}

function factsOf(board: BoardState): Record<string, TicketReportFacts> {
  const facts: Record<string, TicketReportFacts> = {}
  // Later sections win over earlier ones when a key sits in more than one.
  for (const section of ['new', 'inProgress', 'done'] as const) {
    for (const ticket of Object.values(board[section])) {
      facts[ticket.key] = { summary: ticket.summary, status: ticket.status, section }
    }
  }
  return facts
}

// Gathers HRM hours, Claude usage, git commits and the board's facts, then builds the report.
export class ReportReader {
  private queue: Promise<unknown> = Promise.resolve()
  private latest: {
    readonly key: string
    readonly promise: Promise<InsightsView>
    open: boolean
  } | null = null

  constructor(private readonly deps: ReportReaderDeps) {}

  // One read at a time: the same range while one runs shares it, another range waits for it.
  read(range: ReportRange): Promise<InsightsView> {
    const key = rangeKey(range)
    if (this.latest !== null && this.latest.open && this.latest.key === key) {
      return this.latest.promise
    }
    const promise = this.queue.then(() => this.run(range))
    const entry = { key, promise, open: true }
    this.latest = entry
    this.queue = promise.catch(() => undefined)
    void this.queue.then(() => {
      entry.open = false
    })
    return promise
  }

  private async run(range: ReportRange): Promise<InsightsView> {
    const config = this.deps.config()
    const board = this.deps.board()
    const [hrmTasks, agent, commits] = await Promise.all([
      this.readHours(range),
      this.readAgent(board),
      this.deps.commits(range, config),
    ])
    const report = buildReport({
      range,
      agent,
      hrmTasks,
      commits,
      facts: factsOf(board),
      timeZone: config.timeZone,
    })
    return { report, readAt: this.deps.now().toISOString() }
  }

  // Null (hours unread) on any failure or when HRM is not set up.
  private async readHours(range: ReportRange): Promise<readonly HrmTask[] | null> {
    try {
      return await this.deps.hrmTasks(range.from, range.to)
    } catch (error: unknown) {
      this.deps.logError('[report] reading HRM hours failed', error)
      return null
    }
  }

  // The saved keys plus the board's In progress and Done tickets; a ticket that cannot be read is skipped.
  private async readAgent(board: BoardState): Promise<Record<string, readonly AgentStats[]>> {
    const keys = new Set([
      ...this.deps.agent.keys(),
      ...Object.keys(board.inProgress),
      ...Object.keys(board.done),
    ])
    const agent: Record<string, readonly AgentStats[]> = {}
    for (const key of [...keys].filter((candidate) => isTicketKey(candidate))) {
      try {
        agent[key] = await this.deps.agent.readAndSave(key)
      } catch (error: unknown) {
        this.deps.logError(`[report] could not read the Claude sessions of ${key}`, error)
      }
    }
    return agent
  }
}
