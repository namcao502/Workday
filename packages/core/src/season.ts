// Seasonal looks for the app: picked by hand, or read from today's date on "auto".

import { addDays } from './zonedDate.js'

export type Season =
  'spring' | 'summer' | 'autumn' | 'winter' | 'christmas' | 'tet' | 'midautumn' | 'rain' // picked by hand only: the rainy months overlap summer and autumn
export type SeasonSetting = 'off' | 'auto' | 'shuffle' | Season // shuffle: a new season every hour
// How much moves: 'auto' is full on a wide screen and light on a phone; off keeps colors and backdrop.
export type SeasonEffects = 'auto' | 'off' | 'light' | 'full'

export const SEASONS: readonly Season[] = [
  'spring',
  'summer',
  'autumn',
  'winter',
  'christmas',
  'tet',
  'midautumn',
  'rain',
]

const SEASON_SETTINGS: ReadonlySet<string> = new Set<string>(['off', 'auto', 'shuffle', ...SEASONS])
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

// Ram thang 8 (15th of the 8th lunar month), same algorithm and time zone as TET_DAYS.
// prettier-ignore
const MID_AUTUMN_DAYS: readonly string[] = [
  '2024-09-17', '2025-10-06', '2026-09-25', '2027-09-15', '2028-10-03', '2029-09-22', '2030-09-12',
  '2031-10-01', '2032-09-19', '2033-09-08', '2034-09-26', '2035-09-16', '2036-10-04', '2037-09-24',
  '2038-09-13', '2039-10-02', '2040-09-20', '2041-09-09', '2042-09-28', '2043-09-17', '2044-10-05',
  '2045-09-25', '2046-09-15', '2047-10-04', '2048-09-22', '2049-09-11', '2050-09-30', '2051-09-19',
  '2052-09-07', '2053-09-26', '2054-09-16', '2055-10-05', '2056-09-24', '2057-09-13', '2058-10-02',
  '2059-09-21', '2060-09-09',
]

// The lanterns are out for the week around the full moon.
const MID_AUTUMN_DAYS_BEFORE = 4
const MID_AUTUMN_DAYS_AFTER = 2

// Tet decorations go up around 23 thang Chap and come down after mung 10.
const TET_DAYS_BEFORE = 7
const TET_DAYS_AFTER = 9

function dayInYear(days: readonly string[], year: number): string | null {
  return days.find((day) => day.startsWith(`${String(year)}-`)) ?? null
}

export function tetDate(year: number): string | null {
  return dayInYear(TET_DAYS, year)
}

export function midAutumnDate(year: number): string | null {
  return dayInYear(MID_AUTUMN_DAYS, year)
}

// True when the date is within [day - before, day + after] of that year's festival day.
function isAround(day: string | null, date: string, before: number, after: number): boolean {
  return day !== null && date >= addDays(day, -before) && date <= addDays(day, after)
}

// "2026-12-24" -> christmas. Northern-hemisphere months; Christmas takes Dec 1-26 out of winter, Tet its
// two weeks out of winter or spring, Mid-Autumn its week out of autumn (or late summer).
export function seasonForDate(date: string): Season {
  const year = Number(date.slice(0, 4))
  if (isAround(tetDate(year), date, TET_DAYS_BEFORE, TET_DAYS_AFTER)) {
    return 'tet'
  }
  if (isAround(midAutumnDate(year), date, MID_AUTUMN_DAYS_BEFORE, MID_AUTUMN_DAYS_AFTER)) {
    return 'midautumn'
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

// mulberry32: a small seeded generator, so a cycle's order is the same on every device and reload.
function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let mixed = Math.imul(state ^ (state >>> 15), state | 1)
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61)
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296
  }
}

// Fisher-Yates over the seasons, seeded by the cycle number.
function cycleOrder(cycle: number): Season[] {
  const random = seededRandom(cycle)
  const order = [...SEASONS]
  for (let index = order.length - 1; index > 0; index--) {
    const pick = Math.floor(random() * (index + 1))
    const swapped = order[pick]
    const current = order[index]
    if (swapped !== undefined && current !== undefined) {
      order[index] = swapped
      order[pick] = current
    }
  }
  return order
}

// hour: whole hours since 1970. Each run of SEASONS.length hours shows every season once, in an order of its
// own; a cycle that would open on the season the last one closed on swaps its first two.
export function shuffledSeason(hour: number): Season {
  const cycle = Math.floor(hour / SEASONS.length)
  const order = cycleOrder(cycle)
  const [first, second] = order
  // Swapping the first two never moves the last, so the previous cycle's raw order says how it ended.
  if (first !== undefined && second !== undefined && first === cycleOrder(cycle - 1).at(-1)) {
    order[0] = second
    order[1] = first
  }
  return order[hour - cycle * SEASONS.length] ?? 'spring'
}

// The season to draw now; null keeps the plain theme. hour: whole hours since 1970, for shuffle.
export function activeSeason(setting: SeasonSetting, today: string, hour: number): Season | null {
  if (setting === 'off') {
    return null
  }
  if (setting === 'shuffle') {
    return shuffledSeason(hour)
  }
  return setting === 'auto' ? seasonForDate(today) : setting
}

export function parseSeasonSetting(value: unknown): SeasonSetting | null {
  return typeof value === 'string' && SEASON_SETTINGS.has(value) ? (value as SeasonSetting) : null
}

export function parseSeasonEffects(value: unknown): SeasonEffects | null {
  return typeof value === 'string' && SEASON_EFFECTS.has(value) ? (value as SeasonEffects) : null
}
