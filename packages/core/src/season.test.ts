import { describe, expect, it } from 'vitest'
import { activeSeason, parseSeasonSetting, seasonForDate } from './season.js'

describe('seasonForDate', () => {
  it('reads Christmas from Dec 1 to Dec 26, then winter until the end of February', () => {
    expect(seasonForDate('2026-11-30')).toBe('autumn')
    expect(seasonForDate('2026-12-01')).toBe('christmas')
    expect(seasonForDate('2026-12-26')).toBe('christmas')
    expect(seasonForDate('2026-12-27')).toBe('winter')
    expect(seasonForDate('2027-01-15')).toBe('winter')
    expect(seasonForDate('2028-02-29')).toBe('winter')
  })

  it('splits the rest of the year into spring, summer and autumn by month', () => {
    expect(seasonForDate('2027-03-01')).toBe('spring')
    expect(seasonForDate('2027-05-31')).toBe('spring')
    expect(seasonForDate('2027-06-01')).toBe('summer')
    expect(seasonForDate('2027-08-31')).toBe('summer')
    expect(seasonForDate('2027-09-01')).toBe('autumn')
  })
})

describe('activeSeason', () => {
  it('follows the date on auto, keeps a picked season, and is null when off', () => {
    expect(activeSeason('auto', '2026-12-24')).toBe('christmas')
    expect(activeSeason('spring', '2026-12-24')).toBe('spring')
    expect(activeSeason('off', '2026-12-24')).toBeNull()
  })
})

describe('parseSeasonSetting', () => {
  it('accepts the known settings and rejects anything else', () => {
    expect(parseSeasonSetting('winter')).toBe('winter')
    expect(parseSeasonSetting('off')).toBe('off')
    expect(parseSeasonSetting('monsoon')).toBeNull()
    expect(parseSeasonSetting(3)).toBeNull()
  })
})
