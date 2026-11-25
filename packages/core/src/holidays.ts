// "MM-DD" repeats yearly, "YYYY-MM-DD" is one day; lunar and make-up days move, so the user adds those as dates.
export const DEFAULT_HOLIDAYS: readonly string[] = ['01-01', '04-30', '05-01', '09-02', '11-24']

const ENTRY_PATTERN = /^(?:(\d{4})-)?(\d{2})-(\d{2})$/
const LEAP_YEAR = 2024 // lets "02-29" through as a yearly entry

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

// Valid entries only, each once, yearly ones first, then by date.
export function normalizeHolidays(entries: readonly string[]): readonly string[] {
  const valid = [...new Set(entries.map((entry) => entry.trim()))].filter(isHolidayEntry)
  return valid.sort((left, right) => {
    if (left.length !== right.length) {
      return left.length - right.length
    }
    return left < right ? -1 : left > right ? 1 : 0
  })
}

// date is "YYYY-MM-DD".
export function isHoliday(date: string, holidays: readonly string[]): boolean {
  const monthDay = date.slice(5)
  return holidays.some((entry) => entry === date || entry === monthDay)
}
