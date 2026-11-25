import { describe, expect, it } from 'vitest'
import { DEFAULT_HOLIDAYS, holidayOn, isHolidayEntry, normalizeHolidays } from './holidays.js'

describe('holidays', () => {
  it('accepts yearly and one-off entries, and rejects impossible dates', () => {
    expect(isHolidayEntry('04-30')).toBe(true)
    expect(isHolidayEntry('02-29')).toBe(true)
    expect(isHolidayEntry('2027-02-08')).toBe(true)
    expect(isHolidayEntry('2027-02-29')).toBe(false)
    expect(isHolidayEntry('13-01')).toBe(false)
    expect(isHolidayEntry('4-30')).toBe(false)
  })

  it('finds a yearly entry in any year and a one-off only on its day, the one-off first', () => {
    expect(holidayOn('2027-04-30', DEFAULT_HOLIDAYS)).toEqual({ date: '04-30', name: null })
    expect(holidayOn('2027-09-03', DEFAULT_HOLIDAYS)).toBeNull()
    const list = [
      { date: '02-08', name: 'Yearly' },
      { date: '2027-02-08', name: 'Tet' },
    ]
    expect(holidayOn('2027-02-08', list)?.name).toBe('Tet')
    expect(holidayOn('2028-02-08', list)?.name).toBe('Yearly')
  })

  it('normalizes: trims, drops bad dates, keeps the later of a repeat, blanks an empty name', () => {
    expect(
      normalizeHolidays([
        { date: ' 09-02', name: 'A' },
        { date: '2027-02-08', name: ' Tet ' },
        { date: 'x', name: null },
        { date: '09-02', name: '  ' },
        { date: '01-01', name: null },
      ]),
    ).toEqual([
      { date: '01-01', name: null },
      { date: '09-02', name: null },
      { date: '2027-02-08', name: 'Tet' },
    ])
  })
})
