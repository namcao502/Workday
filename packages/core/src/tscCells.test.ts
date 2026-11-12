import { describe, expect, it } from 'vitest'
import {
  cellsForDate,
  dateLabelsMatch,
  expectedDateLabel,
  parseColumns,
  rowForDate,
  worksheetFor,
} from './tscCells.js'

describe('tscCells', () => {
  it('computes the row as header rows plus the day of year', () => {
    expect(rowForDate('2026-01-01', 2)).toBe(3)
    expect(rowForDate('2026-07-01', 2)).toBe(184)
    expect(rowForDate('2026-07-01', 3)).toBe(185)
  })

  it('produces one cell per column', () => {
    expect(cellsForDate('2026-07-01', ['M', 'J'], 2)).toEqual(['M184', 'J184'])
    expect(cellsForDate('2026-07-01', ['D', 'E'], 2)).toEqual(['D184', 'E184'])
  })

  it('returns no cells for no columns', () => {
    expect(cellsForDate('2026-07-01', [], 2)).toEqual([])
  })

  it.each([
    ['M, J', ['M', 'J']],
    ['m j', ['M', 'J']],
    ['D, D, E', ['D', 'E']],
    ['AA,bb', ['AA', 'BB']],
    ['  ', []],
    ['', []],
  ])('parseColumns normalizes %j', (raw, expected) => {
    expect(parseColumns(raw)).toEqual(expected)
  })

  it('names the worksheet by year from the pattern', () => {
    expect(worksheetFor('2026-07-01', 'Daily Reports - {year}')).toBe('Daily Reports - 2026')
    expect(worksheetFor('2025-12-31', 'Daily Reports - {year}')).toBe('Daily Reports - 2025')
  })

  it('writes the expected date label without leading zeros', () => {
    expect(expectedDateLabel('2026-07-01')).toBe('7/1/2026')
    expect(expectedDateLabel('2026-12-09')).toBe('12/9/2026')
  })

  it.each([
    ['7/1/2026', '7/1/2026', true],
    ['07/01/2026', '7/1/2026', true],
    ['7/2/2026', '7/1/2026', false],
    ['', '7/1/2026', false],
    ['2026-07-01', '7/1/2026', false],
  ])('dateLabelsMatch %j vs %j is %j', (read, expected, result) => {
    expect(dateLabelsMatch(read, expected)).toBe(result)
  })
})
