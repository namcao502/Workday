import { activeSeason, todayIn, type Season, type SeasonSetting } from '@workday/core'
import { useEffect, useState } from 'react'

const RECHECK_MS = 60 * 60 * 1000

// The season to draw now; on "auto" it is re-read every hour, so it turns over at midnight without a reload.
export function useActiveSeason(
  setting: SeasonSetting | undefined,
  timeZone: string | undefined,
): Season | null {
  const [today, setToday] = useState(() => todayIn(timeZone ?? 'UTC', new Date()))
  useEffect(() => {
    setToday(todayIn(timeZone ?? 'UTC', new Date()))
    const timer = setInterval(() => {
      setToday(todayIn(timeZone ?? 'UTC', new Date()))
    }, RECHECK_MS)
    return () => {
      clearInterval(timer)
    }
  }, [timeZone])
  return setting === undefined ? null : activeSeason(setting, today)
}
