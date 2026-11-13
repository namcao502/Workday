import {
  addDayUsage,
  combineAgentStats,
  EMPTY_DAY_USAGE,
  type AgentDayUsage,
  type AgentStats,
} from './agentStats.js'
import type { ReportRange } from './reportRanges.js'
import type { TicketCommitStats } from './ticketCommits.js'
import type { HrmTask } from './timesheetWeek.js'
import { addDays, todayIn } from './zonedDate.js'

export const DEFAULT_REPORT_TIME_ZONE = 'Asia/Ho_Chi_Minh'
const SECONDS_PER_HOUR = 3600

export interface TicketReportFacts {
  readonly summary: string | null
  readonly status: string | null
  readonly section: string | null
}

export interface TicketReportRow {
  readonly ticketKey: string
  readonly facts: TicketReportFacts
  readonly hours: number | null // null = HRM was not read
  readonly sessions: number
  readonly turns: number
  readonly claudeSeconds: number
  readonly tokens: AgentDayUsage
  readonly commits: TicketCommitStats | null
  readonly agent: AgentStats | null
}

export interface TicketReport {
  readonly range: ReportRange
  readonly rows: readonly TicketReportRow[]
  readonly hoursRead: boolean
  readonly hoursByDay: Readonly<Record<string, number>> // empty when HRM was not read
  readonly tokensByDay: Readonly<Record<string, number>>
}

export interface TicketReportInput {
  readonly range: ReportRange
  readonly agent: Readonly<Record<string, readonly AgentStats[]>> // per ticket, one entry per session
  readonly hrmTasks: readonly HrmTask[] | null
  readonly commits: Readonly<Record<string, TicketCommitStats>>
  readonly facts: Readonly<Record<string, TicketReportFacts>>
  readonly timeZone?: string // the zone the session days are keyed in
}

const NO_FACTS: TicketReportFacts = { summary: null, status: null, section: null }

export function totalTokens(usage: AgentDayUsage): number {
  return usage.inputTokens + usage.outputTokens + usage.cacheReadTokens + usage.cacheWriteTokens
}

function isInRange(day: string, range: ReportRange): boolean {
  return day >= range.from && day <= range.to
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0)
}

// One session cut down to the range; null when it has no day inside it.
function cutToRange(session: AgentStats, range: ReportRange, timeZone: string): AgentStats | null {
  const dayOf = (iso: string): string => todayIn(timeZone, new Date(iso))
  const inRange = (iso: string): boolean => isInRange(dayOf(iso), range)

  const days: Record<string, AgentDayUsage> = {}
  if (session.days !== null) {
    for (const [day, usage] of Object.entries(session.days)) {
      if (isInRange(day, range)) {
        days[day] = usage
      }
    }
  } else if (session.lastActivity !== null && inRange(session.lastActivity)) {
    // Saved before per-day reads: the whole session sits on its last day.
    days[dayOf(session.lastActivity)] = {
      inputTokens: session.inputTokens,
      outputTokens: session.outputTokens,
      cacheReadTokens: session.cacheReadTokens,
      cacheWriteTokens: session.cacheWriteTokens,
      turns: session.turns,
      turnSeconds: session.turnSeconds,
    }
  }

  const usages = Object.values(days)
  if (usages.length === 0) {
    return null
  }
  const total = usages.reduce(addDayUsage, EMPTY_DAY_USAGE)
  return {
    ...session,
    ...total,
    sessions: 1,
    compacts: session.compacts.filter((compact) => inRange(compact.at)),
    skills: session.skills.filter((skill) => inRange(skill.at)),
    subagents: session.subagents.filter(
      (subagent) => subagent.startedAt !== null && inRange(subagent.startedAt),
    ),
    apiErrors: session.apiErrors.filter((error) => inRange(error.at)),
    days,
  }
}

// The ticket's sessions combined, cut to the range; null when no session has a day inside it.
export function agentInRange(
  sessions: readonly AgentStats[],
  range: ReportRange,
  timeZone: string = DEFAULT_REPORT_TIME_ZONE,
): AgentStats | null {
  const cut = sessions.flatMap((session) => {
    const inRange = cutToRange(session, range, timeZone)
    return inRange === null ? [] : [inRange]
  })
  return cut.length === 0 ? null : combineAgentStats(cut)
}

function datesIn(range: ReportRange): readonly string[] {
  const dates: string[] = []
  for (let day = range.from; day <= range.to; day = addDays(day, 1)) {
    dates.push(day)
  }
  return dates
}

// Keys compare case-insensitively; the first spelling seen wins.
function uniqueKeys(keys: readonly string[]): readonly string[] {
  const seen = new Map<string, string>()
  for (const key of keys) {
    const lower = key.toLowerCase()
    if (!seen.has(lower)) {
      seen.set(lower, key)
    }
  }
  return [...seen.values()]
}

function byLowerKey<T>(record: Readonly<Record<string, T>>): ReadonlyMap<string, T> {
  return new Map(Object.entries(record).map(([key, value]) => [key.toLowerCase(), value]))
}

function compareRows(a: TicketReportRow, b: TicketReportRow): number {
  const byHours = (b.hours ?? 0) - (a.hours ?? 0)
  if (byHours !== 0) {
    return byHours
  }
  const byTokens = totalTokens(b.tokens) - totalTokens(a.tokens)
  if (byTokens !== 0) {
    return byTokens
  }
  const left = a.ticketKey.toLowerCase()
  const right = b.ticketKey.toLowerCase()
  return left < right ? -1 : left > right ? 1 : 0
}

// Merges HRM hours, git commits, Claude usage and the board's facts into one ticket table plus a total per day.
export function buildReport(input: TicketReportInput): TicketReport {
  const { range } = input
  const timeZone = input.timeZone ?? DEFAULT_REPORT_TIME_ZONE
  const agent = byLowerKey(input.agent)
  const commits = byLowerKey(input.commits)
  const facts = byLowerKey(input.facts)
  const hoursRead = input.hrmTasks !== null
  const hrmTasks = (input.hrmTasks ?? []).filter((task) => isInRange(task.date, range))

  const keys = uniqueKeys([
    ...Object.keys(input.agent),
    ...Object.keys(input.commits),
    ...hrmTasks.map((task) => task.ticketKey),
  ])

  const rows: TicketReportRow[] = []
  for (const key of keys) {
    const lower = key.toLowerCase()
    const tasks = hrmTasks.filter((task) => task.ticketKey.toLowerCase() === lower)
    const hours = hoursRead
      ? sum(tasks.map((task) => task.workingSeconds)) / SECONDS_PER_HOUR
      : null
    const ticketAgent = agentInRange(agent.get(lower) ?? [], range, timeZone)
    const ticketCommits = commits.get(lower) ?? null
    const tokens: AgentDayUsage =
      ticketAgent === null
        ? EMPTY_DAY_USAGE
        : {
            inputTokens: ticketAgent.inputTokens,
            outputTokens: ticketAgent.outputTokens,
            cacheReadTokens: ticketAgent.cacheReadTokens,
            cacheWriteTokens: ticketAgent.cacheWriteTokens,
            turns: ticketAgent.turns,
            turnSeconds: ticketAgent.turnSeconds,
          }

    const isListed =
      (hours ?? 0) > 0 ||
      (ticketCommits !== null && ticketCommits.commits > 0) ||
      totalTokens(tokens) > 0
    if (!isListed) {
      continue
    }

    const ticketFacts = facts.get(lower) ?? NO_FACTS
    const summary =
      ticketFacts.summary !== null && ticketFacts.summary !== ''
        ? ticketFacts.summary
        : (tasks.find((task) => task.summary !== null && task.summary !== '')?.summary ?? null)
    rows.push({
      ticketKey: key,
      facts: { ...ticketFacts, summary },
      hours,
      sessions: ticketAgent?.sessions ?? 0,
      turns: tokens.turns,
      claudeSeconds: tokens.turnSeconds,
      tokens,
      commits: ticketCommits,
      agent: ticketAgent,
    })
  }

  const sorted = [...rows].sort(compareRows)
  const hoursByDay: Record<string, number> = {}
  const tokensByDay: Record<string, number> = {}
  for (const day of datesIn(range)) {
    if (hoursRead) {
      const seconds = sum(
        hrmTasks.filter((task) => task.date === day).map((task) => task.workingSeconds),
      )
      hoursByDay[day] = seconds / SECONDS_PER_HOUR
    }
    tokensByDay[day] = sum(
      sorted.map((row) => totalTokens(row.agent?.days?.[day] ?? EMPTY_DAY_USAGE)),
    )
  }
  return { range, rows: sorted, hoursRead, hoursByDay, tokensByDay }
}
