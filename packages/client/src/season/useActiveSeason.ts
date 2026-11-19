import { activeSeason, todayIn, type Season, type SeasonSetting } from '@workday/core'
import { useEffect, useState } from 'react'

const HOUR_MS = 60 * 60 * 1000

// The season to draw now. The clock is re-read at the top of every hour, so "auto" turns over at midnight
// and "shuffle" changes on the hour without a reload.
export function useActiveSeason(
  setting: SeasonSetting | undefined,
  timeZone: string | undefined,
): Season | null {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    function tick(): void {
      const current = Date.now()
      setNow(current)
      timer = setTimeout(tick, HOUR_MS - (current % HOUR_MS))
    }
    tick()
    return () => {
      clearTimeout(timer)
    }
  }, [])
  if (setting === undefined) {
    return null
  }
  const today = todayIn(timeZone ?? 'UTC', new Date(now))
  return activeSeason(setting, today, Math.floor(now / HOUR_MS))
}
