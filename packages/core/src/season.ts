// Seasonal looks for the app: picked by hand, or read from today's date on "auto".

export type Season = 'spring' | 'summer' | 'autumn' | 'winter' | 'christmas'
export type SeasonSetting = 'off' | 'auto' | Season

export const SEASONS: readonly Season[] = ['spring', 'summer', 'autumn', 'winter', 'christmas']

const SEASON_SETTINGS: ReadonlySet<string> = new Set<string>(['off', 'auto', ...SEASONS])

const LAST_CHRISTMAS_DAY = 26

// "2026-12-24" -> christmas. Northern-hemisphere months; Christmas takes Dec 1-26 out of winter.
export function seasonForDate(date: string): Season {
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
