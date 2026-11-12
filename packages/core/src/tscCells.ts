import { dayOfYear } from './zonedDate.js'

// "{year}" in the pattern becomes the date's year.
export function worksheetFor(date: string, pattern: string): string {
  return pattern.replaceAll('{year}', date.slice(0, 4))
}

export function rowForDate(date: string, headerRows: number): number {
  return headerRows + dayOfYear(date)
}

export function cellsForDate(
  date: string,
  columns: readonly string[],
  headerRows: number,
): readonly string[] {
  const row = rowForDate(date, headerRows)
  return columns.map((column) => `${column}${String(row)}`)
}

// "M, J" or "m j,k" to uppercase column letters, unique, in order; anything else is dropped.
export function parseColumns(raw: string): readonly string[] {
  const columns: string[] = []
  for (const match of raw.matchAll(/[A-Za-z]+/g)) {
    const column = match[0].toUpperCase()
    if (!columns.includes(column)) {
      columns.push(column)
    }
  }
  return columns
}

// Column B holds the date as M/D/YYYY, no leading zeros.
export function expectedDateLabel(date: string): string {
  return [date.slice(5, 7), date.slice(8, 10), date.slice(0, 4)]
    .map((part) => String(Number(part)))
    .join('/')
}

function numbersIn(value: string): readonly number[] {
  return Array.from(value.matchAll(/\d+/g), (match) => Number(match[0]))
}

// Positional numeric compare; any other shape fails closed so the wrong day is never written.
export function dateLabelsMatch(read: string, expected: string): boolean {
  const expectedNumbers = numbersIn(expected)
  const readNumbers = numbersIn(read)
  return (
    expectedNumbers.length === 3 &&
    readNumbers.length === 3 &&
    expectedNumbers.every((value, index) => value === readNumbers[index])
  )
}
