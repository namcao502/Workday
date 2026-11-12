import {
  slotsFor,
  type HoursLog,
  type HoursWrite,
  type HrmConfig,
  type HrmTask,
} from '@workday/core'
import { retryTransient } from '../retry.js'
import {
  buildLogArgs,
  parseDayHours,
  parseOffDates,
  parseTimesheetTasks,
  parseToolEnvelope,
  parseTotalPages,
} from './parseHrm.js'
import { connectMcp, type McpSession, type McpToolResult } from './mcpSession.js'

const VALIDATE_TIMEOUT_MILLISECONDS = 20_000
const LEAVE_PAGE_SIZE = 50
const MAX_LEAVE_PAGES = 5
const OVERLAP_CODE = 'LOGTIME_OVERLAP'
const AUTH_FAILURE = /401|403|unauthorized|forbidden/i

type Connect = (url: string, apiKey: string) => Promise<McpSession>

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

// HRM over its MCP server; the key is sent only to the configured mcpUrl and never logged.
export class HrmHoursLog implements HoursLog {
  constructor(
    private readonly config: HrmConfig,
    private readonly apiKey: string,
    private readonly connect: Connect = connectMcp,
  ) {}

  async validate(): Promise<
    { readonly ok: true } | { readonly ok: false; readonly reason: 'rejected' | 'unreachable' }
  > {
    let timer: NodeJS.Timeout | undefined
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error('HRM validation timed out'))
      }, VALIDATE_TIMEOUT_MILLISECONDS)
    })
    try {
      await Promise.race([this.open((session) => session.listTools()), timeout])
      return { ok: true }
    } catch (error: unknown) {
      return { ok: false, reason: AUTH_FAILURE.test(messageOf(error)) ? 'rejected' : 'unreachable' }
    } finally {
      clearTimeout(timer)
    }
  }

  // One session for the whole run; a re-sent slot comes back as LOGTIME_OVERLAP, so a retry never double-logs.
  async logTickets(
    date: string,
    tickets: readonly string[],
    minutes: readonly number[],
  ): Promise<HoursWrite> {
    try {
      const errors = await this.open(async (session) => {
        const failures: string[] = []
        for (const [index, ticket] of tickets.entries()) {
          const failure = await this.logTicket(session, date, ticket, slotsFor(minutes, index))
          if (failure !== null) {
            failures.push(failure)
          }
        }
        return failures
      })
      return errors.length === 0
        ? { ok: true }
        : { ok: false, detail: `HRM rejected ${errors.join('; ')}` }
    } catch (error: unknown) {
      return { ok: false, detail: messageOf(error) }
    }
  }

  async dayHours(dates: readonly string[]): Promise<Readonly<Record<string, number | null>>> {
    const hours: Record<string, number | null> = Object.fromEntries(dates.map((d) => [d, null]))
    try {
      await this.open(async (session) => {
        for (const date of dates) {
          try {
            // projectId must be present even though optional: the schema requires every key; null = all projects.
            const result = await this.call(session, 'get_my_day_logs', {
              workDate: date,
              projectId: null,
            })
            hours[date] = parseDayHours(result.isError, result.text)
          } catch (error: unknown) {
            console.warn(`HRM day hours for ${date} failed: ${messageOf(error)}`)
          }
        }
      })
    } catch (error: unknown) {
      console.warn(`HRM day hours connect failed: ${messageOf(error)}`)
    }
    return hours
  }

  async tasks(from: string, to: string): Promise<readonly HrmTask[] | null> {
    try {
      return await this.open(async (session) => {
        const result = await this.call(session, 'get_my_timesheet_tasks', {
          fromDate: from,
          toDate: to,
          projectId: this.config.projectId,
        })
        return parseTimesheetTasks(result.isError, result.text)
      })
    } catch (error: unknown) {
      console.warn(`HRM tasks failed: ${messageOf(error)}`)
      return null
    }
  }

  // A timesheet-scoped key gets FORBIDDEN here; that must degrade to "no off days", not an error.
  async offDates(from: string, to: string): Promise<readonly string[]> {
    try {
      return await this.open(async (session) => {
        const dates = new Set<string>()
        for (let page = 1; page <= MAX_LEAVE_PAGES; page += 1) {
          const result = await this.call(session, 'find_my_requests', {
            kind: 'leave',
            status: null,
            fromDate: `${from}T00:00:00`,
            toDate: `${to}T23:59:59`,
            page,
            pageSize: LEAVE_PAGE_SIZE,
          })
          for (const date of parseOffDates(result.isError, result.text)) {
            dates.add(date)
          }
          if (page >= parseTotalPages(result.text)) {
            break
          }
        }
        return [...dates].sort()
      })
    } catch (error: unknown) {
      console.warn(`HRM off-day lookup failed: ${messageOf(error)}`)
      return []
    }
  }

  private async open<Result>(use: (session: McpSession) => Promise<Result>): Promise<Result> {
    const session = await retryTransient(() => this.connect(this.config.mcpUrl, this.apiKey))
    try {
      return await use(session)
    } finally {
      await session.close().catch(() => undefined)
    }
  }

  private call(
    session: McpSession,
    name: string,
    args: Readonly<Record<string, unknown>>,
  ): Promise<McpToolResult> {
    return retryTransient(() => session.callTool(name, args))
  }

  // Returns "<ticket>: <code>: <message>" for a hard error, which skips the ticket's remaining slots.
  private async logTicket(
    session: McpSession,
    date: string,
    ticket: string,
    slots: ReturnType<typeof slotsFor>,
  ): Promise<string | null> {
    for (const slot of slots) {
      const args = buildLogArgs(this.config.projectId, ticket, date, slot)
      const result = await this.call(session, 'log_timesheet', args)
      const envelope = parseToolEnvelope(result.isError, result.text)
      if (!envelope.success && envelope.code !== OVERLAP_CODE) {
        return `${ticket}: ${envelope.error ?? 'unknown error'}`
      }
    }
    return null
  }
}
