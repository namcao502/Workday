import type { KnowledgeScanConfig, ScanDay, ScanOutcome } from './api.js'
import { addDays, weekdayOf, zonedClock } from './zonedDate.js'

export const SCAN_LIMIT_HOURS: readonly KnowledgeScanConfig['limitHours'][] = [1, 2, 3, 4, 6]
export const SCAN_DAYS: readonly ScanDay[] = [
  'daily',
  'mon',
  'tue',
  'wed',
  'thu',
  'fri',
  'sat',
  'sun',
]

const FIRST_START_HOUR = 6
const LAST_START_HOUR = 23
const MINUTES_PER_HOUR = 60
const MILLISECONDS_PER_MINUTE = 60_000
const DAYS_TO_LOOK_AHEAD = 7
const WEEKDAY_NAMES: readonly ScanDay[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

const TIMESTAMP_PREFIX = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} /
const FOUND_LINE = /^Found (\d+) ticket/
const MINING_LINE = /^Mining \S+ \.\.\.$/
const REFRESHING_MAP_PREFIX = 'Refreshing map '
// Only the script's own failure lines: a mined ticket's summary may well say "failed".
const PROBLEM_PREFIXES: readonly string[] = ['FAILED (exit', 'Giving up on ', 'ERROR:']

// On the hour from 06:00 to 23:00, plus the configured time when it is not one of them.
export function startTimeChoices(extraTime: string | null): readonly string[] {
  const choices: string[] = []
  for (let hour = FIRST_START_HOUR; hour <= LAST_START_HOUR; hour++) {
    choices.push(`${String(hour).padStart(2, '0')}:00`)
  }
  if (extraTime !== null && parseTime(extraTime) !== null && !choices.includes(extraTime)) {
    choices.push(extraTime)
    choices.sort()
  }
  return choices
}

// Minutes since midnight of "HH:mm", or null when it is not a time.
export function parseTime(time: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time)
  return match === null ? null : Number(match[1]) * MINUTES_PER_HOUR + Number(match[2])
}

function messageOf(line: string): string {
  return line.replace(TIMESTAMP_PREFIX, '').trimStart()
}

export function scanProblemLines(lines: readonly string[]): readonly string[] {
  return lines
    .map(messageOf)
    .filter((message) => PROBLEM_PREFIXES.some((prefix) => message.startsWith(prefix)))
}

export interface ScanCounts {
  readonly found: number
  readonly mined: number
  readonly refreshed: number
}

export function scanCounts(lines: readonly string[]): ScanCounts {
  let found = 0
  let mined = 0
  let refreshed = 0
  for (const line of lines) {
    const message = line.replace(TIMESTAMP_PREFIX, '')
    const foundMatch = FOUND_LINE.exec(message)
    if (foundMatch !== null) {
      found = Number(foundMatch[1])
    } else if (MINING_LINE.test(message)) {
      mined++
    } else if (message.startsWith(REFRESHING_MAP_PREFIX)) {
      refreshed++
    }
  }
  return { found, mined, refreshed }
}

// A kill by the limit is stopped; any other non-zero exit failed; a finished run with a problem line has problems.
export function judgeRun(
  exitCode: number | null,
  killedForLimit: boolean,
  problemLines: readonly string[],
): ScanOutcome {
  if (killedForLimit) {
    return 'stopped'
  }
  if (exitCode !== 0) {
    return 'failed'
  }
  return problemLines.length === 0 ? 'ok' : 'withProblems'
}

// The wall-clock time on the date in the zone, as an instant; two passes settle the zone's offset.
function instantOf(timeZone: string, date: string, minutes: number): Date {
  const wallMs = Date.parse(`${date}T00:00:00Z`) + minutes * MILLISECONDS_PER_MINUTE
  let guess = wallMs
  for (let pass = 0; pass < 2; pass++) {
    const clock = zonedClock(timeZone, new Date(guess))
    const shownMs = Date.parse(`${clock.date}T00:00:00Z`) + clock.minutes * MILLISECONDS_PER_MINUTE
    guess += wallMs - shownMs
  }
  return new Date(guess)
}

// The first start after `now` on a matching day; null when the scan is off or its time is not "HH:mm".
export function nextRunAt(config: KnowledgeScanConfig, timeZone: string, now: Date): Date | null {
  const minutes = parseTime(config.time)
  if (!config.enabled || minutes === null) {
    return null
  }
  const today = zonedClock(timeZone, now).date
  for (let offset = 0; offset <= DAYS_TO_LOOK_AHEAD; offset++) {
    const date = addDays(today, offset)
    if (config.day !== 'daily' && WEEKDAY_NAMES[weekdayOf(date)] !== config.day) {
      continue
    }
    const instant = instantOf(timeZone, date, minutes)
    if (instant.getTime() > now.getTime()) {
      return instant
    }
  }
  return null
}
