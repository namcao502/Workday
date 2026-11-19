import { describe, expect, it } from 'vitest'
import {
  activeSeason,
  parseSeasonEffects,
  parseSeasonSetting,
  midAutumnDate,
  SEASONS,
  seasonForDate,
  shuffledSeason,
  tetDate,
} from './season.js'

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

describe('Tet', () => {
  it('uses the Vietnamese lunar new year, which differs from the Chinese one in some years', () => {
    expect(tetDate(2027)).toBe('2027-02-06')
    expect(tetDate(2030)).toBe('2030-02-02')
    expect(tetDate(1999)).toBeNull()
  })

  it('runs from a week before Tet to the 10th day, over winter and spring', () => {
    // Tet 2027 is Feb 6: Jan 30 .. Feb 15.
    expect(seasonForDate('2027-01-29')).toBe('winter')
    expect(seasonForDate('2027-01-30')).toBe('tet')
    expect(seasonForDate('2027-02-15')).toBe('tet')
    expect(seasonForDate('2027-02-16')).toBe('winter')
    // Tet 2029 is Feb 13, so its 10th day is in March: spring resumes after.
    expect(seasonForDate('2029-02-22')).toBe('tet')
    expect(seasonForDate('2029-03-01')).toBe('spring')
  })

  it('a year past the table falls back to the plain seasons', () => {
    expect(seasonForDate('2070-02-01')).toBe('winter')
  })
})

describe('Mid-Autumn', () => {
  it('is the 15th of the 8th lunar month', () => {
    expect(midAutumnDate(2026)).toBe('2026-09-25')
    expect(midAutumnDate(2025)).toBe('2025-10-06')
    expect(midAutumnDate(1999)).toBeNull()
  })

  it('runs for the week around the full moon, out of autumn', () => {
    // Mid-Autumn 2026 is Sep 25: Sep 21 .. Sep 27.
    expect(seasonForDate('2026-09-20')).toBe('autumn')
    expect(seasonForDate('2026-09-21')).toBe('midautumn')
    expect(seasonForDate('2026-09-27')).toBe('midautumn')
    expect(seasonForDate('2026-09-28')).toBe('autumn')
  })
})

describe('rain', () => {
  it('can be picked but the date never chooses it, since it overlaps summer and autumn', () => {
    expect(SEASONS).toContain('rain')
    expect(parseSeasonSetting('rain')).toBe('rain')
    const year = Array.from({ length: 366 }, (_, day) =>
      seasonForDate(new Date(Date.UTC(2026, 0, 1 + day)).toISOString().slice(0, 10)),
    )
    expect(year).not.toContain('rain')
  })
})

describe('activeSeason', () => {
  it('follows the date on auto, keeps a picked season, and is null when off', () => {
    expect(activeSeason('auto', '2026-12-24', 0)).toBe('christmas')
    expect(activeSeason('spring', '2026-12-24', 0)).toBe('spring')
    expect(activeSeason('off', '2026-12-24', 0)).toBeNull()
  })

  it('on shuffle follows the hour, not the date', () => {
    expect(activeSeason('shuffle', '2026-12-24', 500_000)).toBe(shuffledSeason(500_000))
    expect(activeSeason('shuffle', '2026-07-01', 500_000)).toBe(shuffledSeason(500_000))
  })
})

describe('shuffledSeason', () => {
  const HOUR = 494_000 // an hour count since 1970, any one will do
  const cycleStart = HOUR - (HOUR % SEASONS.length)

  function cycle(start: number): string[] {
    return Array.from({ length: SEASONS.length }, (_, offset) => shuffledSeason(start + offset))
  }

  it('shows every season once per cycle of eight hours', () => {
    for (
      let start = cycleStart;
      start < cycleStart + 20 * SEASONS.length;
      start += SEASONS.length
    ) {
      expect([...cycle(start)].sort()).toEqual([...SEASONS].sort())
    }
  })

  it('never repeats a season across the seam between two cycles', () => {
    for (
      let start = cycleStart;
      start < cycleStart + 200 * SEASONS.length;
      start += SEASONS.length
    ) {
      expect(shuffledSeason(start + SEASONS.length)).not.toBe(
        shuffledSeason(start + SEASONS.length - 1),
      )
    }
  })

  it('reshuffles each cycle, and the same hour always gives the same season', () => {
    const orders = new Set(
      Array.from({ length: 10 }, (_, index) => cycle(cycleStart + index * SEASONS.length).join()),
    )
    expect(orders.size).toBeGreaterThan(1)
    expect(shuffledSeason(HOUR)).toBe(shuffledSeason(HOUR))
  })
})

describe('parseSeasonSetting', () => {
  it('accepts the known settings and rejects anything else', () => {
    expect(parseSeasonSetting('winter')).toBe('winter')
    expect(parseSeasonSetting('off')).toBe('off')
    expect(parseSeasonSetting('monsoon')).toBeNull()
    expect(parseSeasonSetting(3)).toBeNull()
    expect(parseSeasonSetting('tet')).toBe('tet')
    expect(parseSeasonSetting('shuffle')).toBe('shuffle')
  })

  it('parses the effect level', () => {
    expect(parseSeasonEffects('light')).toBe('light')
    expect(parseSeasonEffects('auto')).toBe('auto')
    expect(parseSeasonEffects('loud')).toBeNull()
  })
})
