// date: "MM-DD" repeats yearly, "YYYY-MM-DD" is one day; lunar and make-up days move, so they are added as dates.
export interface Holiday {
  readonly date: string
  readonly name: string | null // null: the client names the built-in ones in the app language
}

export const DEFAULT_HOLIDAYS: readonly Holiday[] = ['01-01', '04-30', '05-01', '09-02', '11-24'].map(
  (date) => ({ date, name: null }),
)

const ENTRY_PATTERN = /^(?:(\d{4})-)?(\d{2})-(\d{2})$/
const LEAP_YEAR = 2024 // lets "02-29" through as a yearly entry
const NAME_MAX = 60

export function isHolidayEntry(text: string): boolean {
  const match = ENTRY_PATTERN.exec(text)
  if (match === null) {
    return false
  }
  const year = match[1] === undefined ? LEAP_YEAR : Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

function cleanName(name: string | null): string | null {
  const trimmed = (name ?? '').trim().slice(0, NAME_MAX)
  return trimmed === '' ? null : trimmed
}

// Valid dates only, each once (the later entry wins), yearly ones first, then by date.
export function normalizeHolidays(entries: readonly Holiday[]): readonly Holiday[] {
  const byDate = new Map<string, Holiday>()
  for (const entry of entries) {
    const date = entry.date.trim()
    if (isHolidayEntry(date)) {
      byDate.set(date, { date, name: cleanName(entry.name) })
    }
  }
  return [...byDate.values()].sort((left, right) => {
    if (left.date.length !== right.date.length) {
      return left.date.length - right.date.length
    }
    return left.date < right.date ? -1 : left.date > right.date ? 1 : 0
  })
}

// date is "YYYY-MM-DD"; a one-off entry wins over a yearly one on the same day.
export function holidayOn(date: string, holidays: readonly Holiday[]): Holiday | null {
  const monthDay = date.slice(5)
  return (
    holidays.find((entry) => entry.date === date) ??
    holidays.find((entry) => entry.date === monthDay) ??
    null
  )
}
