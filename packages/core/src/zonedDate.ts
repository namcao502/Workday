const FALLBACK_OFFSET_MILLISECONDS = 7 * 3_600_000

// "YYYY-MM-DD" of `now` in the zone. An unknown zone falls back to UTC+7 (Ho Chi Minh has no DST).
export function todayIn(timeZone: string, now: Date): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now)
    const year = parts.find((part) => part.type === 'year')?.value
    const month = parts.find((part) => part.type === 'month')?.value
    const day = parts.find((part) => part.type === 'day')?.value
    if (year !== undefined && month !== undefined && day !== undefined) {
      return `${year}-${month}-${day}`
    }
  } catch (error: unknown) {
    if (!(error instanceof RangeError)) {
      throw error
    }
  }
  return new Date(now.getTime() + FALLBACK_OFFSET_MILLISECONDS).toISOString().slice(0, 10)
}
