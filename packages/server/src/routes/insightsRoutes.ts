import { rangeFor, todayIn, type ReportRange, type ReportRangeKind } from '@workday/core'
import type { FastifyInstance } from 'fastify'
import type { ReportReader } from '../insights/reportReader.js'

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const MAX_CUSTOM_DAYS = 366
const MILLISECONDS_PER_DAY = 86_400_000
const PRESET_KINDS: ReadonlySet<string> = new Set([
  'thisWeek',
  'lastWeek',
  'thisMonth',
  'lastMonth',
])

type PresetKind = Exclude<ReportRangeKind, 'custom'>

function isPreset(kind: string): kind is PresetKind {
  return PRESET_KINDS.has(kind)
}

// The pattern plus a round trip through Date.UTC, so 2026-02-30 is refused.
function isDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) {
    return false
  }
  const [year = 0, month = 0, day = 0] = value.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) === value
}

function parseRange(
  query: Readonly<Record<string, string | undefined>>,
  today: string,
): ReportRange | null {
  const { kind = '', from, to } = query
  if (isPreset(kind)) {
    return rangeFor(kind, today)
  }
  if (kind !== 'custom' || !isDate(from) || !isDate(to) || from > to) {
    return null
  }
  const days = (Date.parse(to) - Date.parse(from)) / MILLISECONDS_PER_DAY + 1
  return days > MAX_CUSTOM_DAYS ? null : { kind, from, to }
}

// Local-only: no config.access, so a remote request never reaches it.
export function registerInsightsRoutes(
  app: FastifyInstance,
  insights: ReportReader,
  timeZone: () => string,
  logError: (message: string, error: unknown) => void = console.error,
): void {
  app.get<{ Querystring: { kind?: string; from?: string; to?: string } }>(
    '/api/insights',
    async (request, reply) => {
      const range = parseRange(request.query, todayIn(timeZone(), new Date()))
      if (range === null) {
        return reply
          .code(400)
          .send({ error: 'Query must be a preset kind, or custom with from and to' })
      }
      try {
        return await insights.read(range)
      } catch (error: unknown) {
        logError('[report] reading the insights failed', error)
        return reply.code(500).send({ ok: false, error: { code: 'insightsFailed' } })
      }
    },
  )
}
