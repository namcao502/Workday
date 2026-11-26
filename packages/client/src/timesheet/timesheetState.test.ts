import { expect, it } from 'vitest'
import { bentoDays } from './timesheetState.js'

const week = ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27'].map((date) => ({
  date,
}))

it('at 4 columns moves today first as the big cell, the rest in week order', () => {
  const result = bentoDays(week, '2026-11-26', 4)
  expect(result.big).toBe('2026-11-26')
  expect(result.days.map((day) => day.date)).toEqual([
    '2026-11-26',
    '2026-11-23',
    '2026-11-24',
    '2026-11-25',
    '2026-11-27',
  ])
})

it('in another week the first day is the big cell, so the week keeps its order', () => {
  expect(bentoDays(week, '2026-12-01', 4)).toEqual({ days: week, big: '2026-11-23' })
})

it('keeps the plain week at other widths', () => {
  expect(bentoDays(week, '2026-11-26', 5)).toEqual({ days: week, big: null })
  expect(bentoDays(week, '2026-11-26', 3)).toEqual({ days: week, big: null })
})
