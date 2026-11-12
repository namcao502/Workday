import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import type { TicketCheck, TimesheetView } from '@workday/core'
import { useCallback, useEffect, useState } from 'react'
import { checkTickets, getTimesheet, queryKeys } from './client.js'

const CHECK_DEBOUNCE_MS = 400
const MINUTE_MS = 60_000

// The refetch on timesheet.changed is wired in useEvents.
export function useTimesheetView(enabled = true): UseQueryResult<TimesheetView> {
  return useQuery({ queryKey: queryKeys.timesheet, queryFn: getTimesheet, enabled })
}

export function useRefreshTimesheet(): () => Promise<void> {
  const queryClient = useQueryClient()
  return useCallback(
    () => queryClient.invalidateQueries({ queryKey: queryKeys.timesheet }),
    [queryClient],
  )
}

// Re-reads the time every minute so countdowns and waiting -> due follow the clock.
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date())
    }, MINUTE_MS)
    return () => {
      clearInterval(timer)
    }
  }, [])
  return now
}

// Checks each new key once (debounced) and keeps the answers for the life of the page.
export function useTicketChecks(keys: readonly string[]): Readonly<Record<string, TicketCheck>> {
  const [checks, setChecks] = useState<Readonly<Record<string, TicketCheck>>>({})
  const missing = keys.filter((key) => !(key in checks)).join(',')

  useEffect(() => {
    if (missing === '') {
      return undefined
    }
    let cancelled = false
    const timer = setTimeout(() => {
      checkTickets(missing.split(','))
        .then((results) => {
          if (!cancelled) {
            setChecks((known) => ({
              ...known,
              ...Object.fromEntries(results.map((result) => [result.key, result])),
            }))
          }
        })
        .catch(() => undefined)
    }, CHECK_DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [missing])

  return checks
}
