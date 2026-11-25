import { describe, expect, it } from 'vitest'
import { DEFAULT_HOLIDAYS, isHoliday, isHolidayEntry, normalizeHolidays } from './holidays.js'

describe('holidays', () => {
  it('accepts yearly and one-off entries, and rejects impossible dates', () => {
    expect(isHolidayEntry('04-30')).toBe(true)
    expect(isHolidayEntry('02-29')).toBe(true)
    expect(isHolidayEntry('2027-02-08')).toBe(true)
    expect(isHolidayEntry('2027-02-29')).toBe(false)
    expect(isHolidayEntry('13-01')).toBe(false)
    expect(isHolidayEntry('4-30')).toBe(false)
  })

  it('matches a yearly entry in any year and a one-off only on its day', () => {
    expect(isHoliday('2027-04-30', DEFAULT_HOLIDAYS)).toBe(true)
    expect(isHoliday('2027-09-02', DEFAULT_HOLIDAYS)).toBe(true)
    expect(isHoliday('2027-09-03', DEFAULT_HOLIDAYS)).toBe(false)
    expect(isHoliday('2027-02-08', ['2027-02-08'])).toBe(true)
    expect(isHoliday('2028-02-08', ['2027-02-08'])).toBe(false)
  })

  it('normalizes: trims, drops bad and repeated entries, sorts yearly first', () => {
    expect(normalizeHolidays([' 09-02', '2027-02-08', 'x', '01-01', '09-02', '2026-04-27'])).toEqual(
      ['01-01', '09-02', '2026-04-27', '2027-02-08'],
    )
  })
})
