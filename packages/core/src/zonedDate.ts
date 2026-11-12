const FALLBACK_OFFSET_MILLISECONDS = 7 * 3_600_000

// "YYYY-MM-DD" of `now` in the zone. An unknown zone falls back to UTC+7 (Ho Chi Minh has no DST).
export function todayIn(timeZone: string, now: Date): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now)
    const year = parts.find((part) => part.type === 'year')?.value
    const month = parts.find((part) => part.type === 'month')?.value
    const day = parts.find((part) => part.type === 'day')?.value
    if (year !== undefined && month !== undefined && day !== undefined) {
      return `${year}-${month}-${day}`
    }
  } catch (error: unknown) {
    if (!(error instanceof RangeError)) {
      throw error
    }
  }
  return new Date(now.getTime() + FALLBACK_OFFSET_MILLISECONDS).toISOString().slice(0, 10)
}

export interface ZonedClock {
  readonly date: string
  readonly minutes: number
  readonly weekday: number // 0 = Sunday
}

const MINUTES_PER_HOUR = 60
const MILLISECONDS_PER_DAY = 86_400_000

function utcMillisecondsOf(date: string): number {
  return Date.parse(`${date}T00:00:00Z`)
}

export function weekdayOf(date: string): number {
  return new Date(utcMillisecondsOf(date)).getUTCDay()
}

export function addDays(date: string, days: number): string {
  return new Date(utcMillisecondsOf(date) + days * MILLISECONDS_PER_DAY).toISOString().slice(0, 10)
}

// The Monday on or before the date (a Sunday belongs to the week that ended on it).
export function mondayOf(date: string): string {
  const sinceMonday = (weekdayOf(date) + 6) % 7
  return addDays(date, -sinceMonday)
}

export function dayOfYear(date: string): number {
  const startOfYear = utcMillisecondsOf(`${date.slice(0, 4)}-01-01`)
  return Math.round((utcMillisecondsOf(date) - startOfYear) / MILLISECONDS_PER_DAY) + 1
}

// Date, minutes since local midnight and weekday of `now` in the zone; an unknown zone falls back to UTC+7 like todayIn.
export function zonedClock(timeZone: string, now: Date): ZonedClock {
  const date = todayIn(timeZone, now)
  const minutes = minutesOfDayIn(timeZone, now)
  return { date, minutes, weekday: weekdayOf(date) }
}

function minutesOfDayIn(timeZone: string, now: Date): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now)
    const hour = parts.find((part) => part.type === 'hour')?.value
    const minute = parts.find((part) => part.type === 'minute')?.value
    if (hour !== undefined && minute !== undefined) {
      return Number(hour) * MINUTES_PER_HOUR + Number(minute)
    }
  } catch (error: unknown) {
    if (!(error instanceof RangeError)) {
      throw error
    }
  }
  const shifted = new Date(now.getTime() + FALLBACK_OFFSET_MILLISECONDS)
  return shifted.getUTCHours() * MINUTES_PER_HOUR + shifted.getUTCMinutes()
}
