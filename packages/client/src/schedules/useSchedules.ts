import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import type { SchedulesView } from '@workday/core'
import { useEffect, useRef, useState } from 'react'
import { queryKeys } from '../api/client.js'
import { getScanLog, getSchedules, markScansSeen } from '../api/schedulesApi.js'

export const REFRESH_MS = 60_000
export const LOG_POLL_MS = 3000

// refreshMs: the open page re-reads every minute; the shell only listens for events.
export function useSchedulesView(
  enabled: boolean,
  refreshMs: number | false = false,
): UseQueryResult<SchedulesView> {
  return useQuery({
    queryKey: queryKeys.schedules,
    queryFn: getSchedules,
    enabled,
    refetchInterval: refreshMs,
    retry: false,
  })
}

// Opening the page marks the bad runs seen, then re-reads so the sidebar dot clears.
export function useMarkSeenOnOpen(): void {
  const queryClient = useQueryClient()
  useEffect(() => {
    markScansSeen().then(
      () => queryClient.invalidateQueries({ queryKey: queryKeys.schedules }),
      () => undefined,
    )
  }, [queryClient])
}

interface LogRead {
  readonly runId: string | null
  readonly next: number
}

// The run's log; while it runs, reads on from the last offset every few seconds.
export function useScanLog(runId: string | null, running: boolean): string {
  const [text, setText] = useState('')
  const read = useRef<LogRead>({ runId: null, next: 0 })

  useEffect(() => {
    if (runId === null) {
      setText('')
      read.current = { runId: null, next: 0 }
      return undefined
    }
    if (read.current.runId !== runId) {
      read.current = { runId, next: 0 }
      setText('')
    }
    let cancelled = false
    let busy = false // a slow read must not be doubled by the next tick
    async function readMore(id: string): Promise<void> {
      if (busy) {
        return
      }
      busy = true
      try {
        const chunk = await getScanLog(id, read.current.next)
        if (cancelled) {
          return
        }
        read.current = { runId: id, next: chunk.next }
        if (chunk.text !== '') {
          setText((previous) => previous + chunk.text)
        }
      } catch {
        // Keep what is shown; the next tick or the next open tries again.
      } finally {
        busy = false
      }
    }
    void readMore(runId)
    if (!running) {
      return () => {
        cancelled = true
      }
    }
    const timer = setInterval(() => {
      void readMore(runId)
    }, LOG_POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [runId, running])

  return text
}
