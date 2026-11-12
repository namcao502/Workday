import { isTicketKey, type HrmTask, type TimeSlot } from '@workday/core'
import { isRecord } from '../jsonFile.js'

export interface ToolEnvelope {
  readonly success: boolean
  readonly error: string | null
  readonly code: string | null
}

const DROPPED_STATUSES: ReadonlySet<string> = new Set(['rejected', 'cancelled'])
const ALL_DAY_PERIOD = 'allday'
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const SECONDS_PER_HOUR = 3600
const MILLISECONDS_PER_DAY = 86_400_000

function parseJson(text: string | null): unknown {
  if (text === null || text === '') {
    return undefined
  }
  try {
    return JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}

function textField(source: Record<string, unknown>, name: string): string | null {
  const value = source[name]
  return typeof value === 'string' ? value : null
}

// idempotencyKey stays null: HRM treats any string as already seen; LOGTIME_OVERLAP keeps re-runs safe.
export function buildLogArgs(
  projectId: string,
  ticket: string,
  date: string,
  slot: TimeSlot,
): Record<string, unknown> {
  return {
    projectId,
    taskId: ticket,
    workDate: date,
    startTime: `${slot.start}:00`,
    stopTime: `${slot.end}:00`,
    description: null,
    comment: null,
    isBillable: true,
    issueType: null,
    projectStageId: null,
    idempotencyKey: null,
  }
}

// The business result is JSON inside the text; success:false is a failure even when the MCP call worked.
export function parseToolEnvelope(isError: boolean, text: string | null): ToolEnvelope {
  if (isError) {
    return {
      success: false,
      error: text !== null && text !== '' ? text : 'MCP tool error',
      code: null,
    }
  }
  const root = parseJson(text)
  if (!isRecord(root) || typeof root['success'] !== 'boolean') {
    return { success: true, error: null, code: null }
  }
  const failure = root['error']
  let code: string | null = null
  let error: string | null = null
  if (isRecord(failure)) {
    code = textField(failure, 'code')
    const parts = [code, textField(failure, 'message')].filter(
      (part): part is string => part !== null && part !== '',
    )
    error = parts.length === 0 ? null : parts.join(': ')
  }
  return { success: root['success'], error, code }
}

function numberIgnoringCase(source: Record<string, unknown>, name: string): number | null {
  const key = Object.keys(source).find(
    (candidate) => candidate.toLowerCase() === name.toLowerCase(),
  )
  const value = key === undefined ? undefined : source[key]
  return typeof value === 'number' ? value : null
}

// totalHours, else totalSeconds / 3600; null on an error or an unrecognised shape.
export function parseDayHours(isError: boolean, text: string | null): number | null {
  const root = isError ? undefined : parseJson(text)
  if (!isRecord(root) || root['success'] !== true || !isRecord(root['data'])) {
    return null
  }
  const hours = numberIgnoringCase(root['data'], 'totalHours')
  if (hours !== null) {
    return hours
  }
  const seconds = numberIgnoringCase(root['data'], 'totalSeconds')
  return seconds === null ? null : seconds / SECONDS_PER_HOUR
}

function parseTask(item: unknown): HrmTask | null {
  if (!isRecord(item)) {
    return null
  }
  const taskId = textField(item, 'taskId')?.toUpperCase()
  const date = textField(item, 'workDate')
  if (taskId === undefined || !isTicketKey(taskId) || date === null || !ISO_DATE.test(date)) {
    return null
  }
  const seconds = item['workingSeconds']
  return {
    date,
    ticketKey: taskId,
    summary: textField(item, 'description'),
    workingSeconds: typeof seconds === 'number' ? seconds : 0,
  }
}

// One task per ticket and day; null on an error or an unsuccessful result.
export function parseTimesheetTasks(
  isError: boolean,
  text: string | null,
): readonly HrmTask[] | null {
  const root = isError ? undefined : parseJson(text)
  if (!isRecord(root) || root['success'] !== true || !Array.isArray(root['data'])) {
    return null
  }
  const items: readonly unknown[] = root['data']
  return items.map(parseTask).filter((task): task is HrmTask => task !== null)
}

// Reads an object's data only when its sibling success is true, so a FORBIDDEN envelope yields nothing.
function successData(value: unknown): unknown {
  return isRecord(value) && value['success'] === true ? value['data'] : undefined
}

function dateOf(value: unknown): string | null {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null
}

function expandDates(from: string, to: string): readonly string[] {
  const dates: string[] = []
  const end = Date.parse(`${to}T00:00:00Z`)
  for (let day = Date.parse(`${from}T00:00:00Z`); day <= end; day += MILLISECONDS_PER_DAY) {
    dates.push(new Date(day).toISOString().slice(0, 10))
  }
  return dates
}

// Only full-day leave counts: a half day is still half a working day and needs a real ticket.
export function parseOffDates(isError: boolean, text: string | null): readonly string[] {
  const inner = isError ? undefined : successData(parseJson(text))
  const items = successData(inner)
  if (!Array.isArray(items)) {
    return []
  }
  const dates = new Set<string>()
  for (const item of items as readonly unknown[]) {
    if (!isRecord(item)) {
      continue
    }
    const status = (textField(item, 'status') ?? '').toLowerCase()
    const period = (textField(item, 'periodType') ?? '').toLowerCase()
    const from = dateOf(item['fromDate'])
    if (DROPPED_STATUSES.has(status) || period !== ALL_DAY_PERIOD || from === null) {
      continue
    }
    for (const date of expandDates(from, dateOf(item['toDate']) ?? from)) {
      dates.add(date)
    }
  }
  return [...dates].sort()
}

// data.pagination.totalPages; 1 (stop) on anything unrecognised.
export function parseTotalPages(text: string | null): number {
  const inner = successData(parseJson(text))
  const pagination = isRecord(inner) ? inner['pagination'] : undefined
  const total = isRecord(pagination) ? pagination['totalPages'] : undefined
  return typeof total === 'number' && Number.isInteger(total) ? Math.max(1, total) : 1
}
