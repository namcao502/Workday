import { describe, expect, it } from 'vitest'
import { todayIn } from './zonedDate.js'

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
