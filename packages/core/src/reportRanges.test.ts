import { describe, expect, it } from 'vitest'
import { rangeFor } from './reportRanges.js'

describe('rangeFor', () => {
  it('starts this week on Monday and ends today', () => {
    expect(rangeFor('thisWeek', '2026-11-11')).toEqual({
      kind: 'thisWeek',
      from: '2026-11-09',
      to: '2026-11-11',
    })
    expect(rangeFor('thisWeek', '2026-11-08')).toEqual({
      kind: 'thisWeek',
      from: '2026-11-02',
      to: '2026-11-08',
    })
  })

  it('makes last week Monday to Sunday', () => {
    const range = rangeFor('lastWeek', '2026-11-11')
    expect(range.from).toBe('2026-11-02')
    expect(range.to).toBe('2026-11-08')
  })

  it('covers the whole last month and this month so far', () => {
    expect(rangeFor('lastMonth', '2026-03-15')).toMatchObject({
      from: '2026-02-01',
      to: '2026-02-28',
    })
    expect(rangeFor('lastMonth', '2027-01-03')).toMatchObject({
      from: '2026-12-01',
      to: '2026-12-31',
    })
    expect(rangeFor('thisMonth', '2026-03-15')).toMatchObject({
      from: '2026-03-01',
      to: '2026-03-15',
    })
  })
})
