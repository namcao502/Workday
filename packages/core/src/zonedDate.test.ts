import { describe, expect, it } from 'vitest'
import { addDays, dayOfYear, mondayOf, todayIn, weekdayOf, zonedClock } from './zonedDate.js'

describe('todayIn', () => {
  const now = new Date('2026-09-28T23:30:00Z')

  it('returns the Ho Chi Minh date at 23:30 UTC', () => {
    expect(todayIn('Asia/Ho_Chi_Minh', now)).toBe('2026-09-29')
  })

  it('returns the UTC date for UTC', () => {
    expect(todayIn('UTC', now)).toBe('2026-09-28')
  })

  it('falls back to UTC+7 for an unknown zone', () => {
    expect(todayIn('Not/AZone', now)).toBe('2026-09-29')
  })
})

describe('zonedClock', () => {
  it('gives the Ho Chi Minh time of day at 23:30 UTC', () => {
    expect(zonedClock('Asia/Ho_Chi_Minh', new Date('2026-09-28T23:30:00Z'))).toEqual({
      date: '2026-09-29',
      minutes: 6 * 60 + 30,
      weekday: 2,
    })
  })

  it('reads midnight as 0 minutes, not 24 hours', () => {
    expect(zonedClock('UTC', new Date('2026-09-28T00:05:00Z')).minutes).toBe(5)
  })

  it('falls back to UTC+7 for an unknown zone', () => {
    expect(zonedClock('Not/AZone', new Date('2026-09-28T23:30:00Z')).date).toBe('2026-09-29')
  })
})

describe('date arithmetic', () => {
  it('addDays crosses month and year ends', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('weekdayOf counts Sunday as 0', () => {
    expect(weekdayOf('2026-11-01')).toBe(0)
    expect(weekdayOf('2026-11-04')).toBe(3)
  })

  it('mondayOf a Sunday is the Monday before', () => {
    expect(mondayOf('2026-11-01')).toBe('2026-10-26')
    expect(mondayOf('2026-11-02')).toBe('2026-11-02')
    expect(mondayOf('2026-11-04')).toBe('2026-11-02')
  })

  it('dayOfYear of a leap-year Dec 31 is 366', () => {
    expect(dayOfYear('2028-12-31')).toBe(366)
    expect(dayOfYear('2026-12-31')).toBe(365)
    expect(dayOfYear('2026-01-01')).toBe(1)
  })
})
