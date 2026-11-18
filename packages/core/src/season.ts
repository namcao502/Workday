// Seasonal looks for the app: picked by hand, or read from today's date on "auto".

import { addDays } from './zonedDate.js'

export type Season = 'spring' | 'summer' | 'autumn' | 'winter' | 'christmas' | 'tet'
export type SeasonSetting = 'off' | 'auto' | Season
// How much moves: 'auto' is full on a wide screen and light on a phone; off keeps colors and backdrop.
export type SeasonEffects = 'auto' | 'off' | 'light' | 'full'

export const SEASONS: readonly Season[] = [
  'spring',
  'summer',
  'autumn',
  'winter',
  'christmas',
  'tet',
]

const SEASON_SETTINGS: ReadonlySet<string> = new Set<string>(['off', 'auto', ...SEASONS])
const SEASON_EFFECTS: ReadonlySet<string> = new Set<string>(['auto', 'off', 'light', 'full'])

const LAST_CHRISTMAS_DAY = 26

// Mung 1 Tet (Vietnamese lunar new year, UTC+7), from Ho Ngoc Duc's lunar calendar algorithm. It differs
// from the Chinese new year in some years (2030: Feb 2, not Feb 3), so a Chinese table is not a substitute.
const TET_DAYS: readonly string[] = [
  '2024-02-10',
  '2025-01-29',
  '2026-02-17',
  '2027-02-06',
  '2028-01-26',
  '2029-02-13',
  '2030-02-02',
  '2031-01-23',
  '2032-02-11',
  '2033-01-31',
  '2034-02-19',
  '2035-02-08',
  '2036-01-28',
  '2037-02-15',
  '2038-02-04',
  '2039-01-24',
  '2040-02-12',
  '2041-02-01',
  '2042-01-22',
  '2043-02-10',
  '2044-01-30',
  '2045-02-17',
  '2046-02-06',
  '2047-01-26',
  '2048-02-14',
  '2049-02-02',
  '2050-01-23',
  '2051-02-11',
  '2052-02-01',
  '2053-02-18',
  '2054-02-08',
  '2055-01-28',
  '2056-02-15',
  '2057-02-04',
  '2058-01-24',
  '2059-02-12',
  '2060-02-02',
]

// Tet decorations go up around 23 thang Chap and come down after mung 10.
const TET_DAYS_BEFORE = 7
const TET_DAYS_AFTER = 9

export function tetDate(year: number): string | null {
  return TET_DAYS.find((day) => day.startsWith(`${String(year)}-`)) ?? null
}

function isTet(date: string): boolean {
  const tet = tetDate(Number(date.slice(0, 4)))
  return (
    tet !== null && date >= addDays(tet, -TET_DAYS_BEFORE) && date <= addDays(tet, TET_DAYS_AFTER)
  )
}

// "2026-12-24" -> christmas. Northern-hemisphere months; Christmas takes Dec 1-26 out of winter and Tet
// its two weeks out of winter or spring.
export function seasonForDate(date: string): Season {
  if (isTet(date)) {
    return 'tet'
  }
  const month = Number(date.slice(5, 7))
  const day = Number(date.slice(8, 10))
  if (month === 12) {
    return day <= LAST_CHRISTMAS_DAY ? 'christmas' : 'winter'
  }
  if (month <= 2) {
    return 'winter'
  }
  if (month <= 5) {
    return 'spring'
  }
  return month <= 8 ? 'summer' : 'autumn'
}

// The season to draw today; null keeps the plain theme.
export function activeSeason(setting: SeasonSetting, today: string): Season | null {
  if (setting === 'off') {
    return null
  }
  return setting === 'auto' ? seasonForDate(today) : setting
}

export function parseSeasonSetting(value: unknown): SeasonSetting | null {
  return typeof value === 'string' && SEASON_SETTINGS.has(value) ? (value as SeasonSetting) : null
}

export function parseSeasonEffects(value: unknown): SeasonEffects | null {
  return typeof value === 'string' && SEASON_EFFECTS.has(value) ? (value as SeasonEffects) : null
}
