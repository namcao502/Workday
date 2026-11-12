import { isTicketKey, weekdayOf } from '@workday/core'
import type { FastifyInstance, FastifyReply } from 'fastify'
import { isRecord } from '../jsonFile.js'
import type { LogTarget } from '../timesheet/logEntry.js'
import type { TimesheetService } from '../timesheet/timesheetService.js'

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const MONDAY = 1
const TIMESHEET_VIEW = { config: { access: { area: 'timesheet', level: 'view' } } } as const
const TIMESHEET_ACT = { config: { access: { area: 'timesheet', level: 'act' } } } as const
const LOG_TARGETS: ReadonlySet<string> = new Set(['both', 'tsc', 'hrm'])

interface DayTickets {
  readonly date: string
  readonly tickets: readonly string[]
  readonly minutes: readonly number[] | null
}

// The pattern plus a round trip through Date.UTC, so 2026-02-30 is refused.
function isDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) {
    return false
  }
  const [year = 0, month = 0, day = 0] = value.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) === value
}

function isLogTarget(value: unknown): value is LogTarget {
  return typeof value === 'string' && LOG_TARGETS.has(value)
}

function isStringList(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isMinutesFor(value: unknown, tickets: readonly string[]): value is readonly number[] {
  return (
    Array.isArray(value) &&
    value.length === tickets.length &&
    value.every((item) => typeof item === 'number' && Number.isInteger(item) && item > 0)
  )
}

// { date, tickets, minutes | null }; minutes, when given, hold one positive whole number per ticket.
function parseDayTickets(body: unknown): DayTickets | null {
  if (!isRecord(body) || !isDate(body['date']) || !isStringList(body['tickets'])) {
    return null
  }
  const { date, tickets, minutes } = body
  if (minutes === null) {
    return { date, tickets, minutes: null }
  }
  return isMinutesFor(minutes, tickets) ? { date, tickets, minutes } : null
}

function badRequest(reply: FastifyReply, shape: string): FastifyReply {
  return reply.code(400).send({ error: `Body must be ${shape}` })
}

export function registerTimesheetRoutes(app: FastifyInstance, timesheet: TimesheetService): void {
  app.get('/api/timesheet', TIMESHEET_VIEW, () => timesheet.view())

  app.post('/api/timesheet/queue', TIMESHEET_ACT, async (request, reply) => {
    const day = parseDayTickets(request.body)
    if (day === null) {
      return badRequest(reply, '{ date, tickets, minutes }')
    }
    return timesheet.addToQueue(day.date, day.tickets, day.minutes)
  })

  app.put<{ Params: { date: string } }>(
    '/api/timesheet/queue/:date/minutes',
    TIMESHEET_ACT,
    async (request, reply) => {
      const body: unknown = request.body
      const tickets = isRecord(body) ? body['tickets'] : undefined
      const minutes = isRecord(body) ? body['minutes'] : undefined
      if (
        !isDate(request.params.date) ||
        !isStringList(tickets) ||
        !isMinutesFor(minutes, tickets)
      ) {
        return badRequest(reply, '{ tickets, minutes }')
      }
      return timesheet.setQueueMinutes(request.params.date, tickets, minutes)
    },
  )

  app.delete<{ Params: { date: string; key: string } }>(
    '/api/timesheet/queue/:date/:key',
    TIMESHEET_ACT,
    async (request, reply) => {
      await timesheet.removeFromQueue(request.params.date, request.params.key)
      return reply.code(204).send()
    },
  )

  app.delete('/api/timesheet/queue', TIMESHEET_ACT, async (_request, reply) => {
    await timesheet.clearQueue()
    return reply.code(204).send()
  })

  app.post('/api/timesheet/drain', TIMESHEET_ACT, async (request, reply) => {
    const body: unknown = request.body ?? {}
    const date = isRecord(body) ? body['date'] : undefined
    if (!isRecord(body) || (date !== undefined && !isDate(date))) {
      return badRequest(reply, '{ date? }')
    }
    const outcome = await timesheet.drain('user', date)
    return outcome.ok ? outcome.summary : reply.code(409).send(outcome)
  })

  app.post('/api/timesheet/log', TIMESHEET_ACT, async (request, reply) => {
    const day = parseDayTickets(request.body)
    const target = isRecord(request.body) ? request.body['target'] : undefined
    if (day === null || !isLogTarget(target)) {
      return badRequest(reply, '{ date, tickets, minutes, target }')
    }
    const outcome = await timesheet.log({ ...day, target })
    return outcome.ok ? outcome.outcome : reply.code(409).send(outcome)
  })

  app.post('/api/timesheet/off', TIMESHEET_ACT, async (request, reply) => {
    const date = isRecord(request.body) ? request.body['date'] : undefined
    if (!isDate(date)) {
      return badRequest(reply, '{ date }')
    }
    return timesheet.logOff(date)
  })

  app.post('/api/timesheet/week', TIMESHEET_VIEW, async (request, reply) => {
    const body: unknown = request.body
    const monday = isRecord(body) ? body['monday'] : undefined
    const allowSniff = isRecord(body) ? body['allowSniff'] : undefined
    if (!isDate(monday) || weekdayOf(monday) !== MONDAY || typeof allowSniff !== 'boolean') {
      return badRequest(reply, '{ monday, allowSniff }')
    }
    // A remote read never opens Chrome on the PC, whatever the body asks.
    const canSniff = request.isRemote ? false : allowSniff
    // The result arrives through timesheet.changed; the read can open a browser and take a while.
    timesheet.readWeek(monday, canSniff).catch((error: unknown) => {
      request.log.error(error, 'Reading the week failed')
    })
    return reply.code(202).send()
  })

  app.post('/api/timesheet/tickets/check', TIMESHEET_VIEW, async (request, reply) => {
    const keys = isRecord(request.body) ? request.body['keys'] : undefined
    if (!isStringList(keys)) {
      return badRequest(reply, '{ keys }')
    }
    return timesheet.checkTickets(keys.filter(isTicketKey))
  })
}
