import { useQuery } from '@tanstack/react-query'
import {
  DEFAULT_REPORT_TIME_ZONE,
  todayIn,
  type InsightsView,
  type ReportRangeKind,
} from '@workday/core'
import { useEffect, useState } from 'react'
import { getInsights, queryKeys, type InsightsRequest } from '../api/client.js'
import { isRecord } from '../json.js'

export const RANGE_STORAGE_KEY = 'workday.insights.range'
const FIVE_MINUTES_MS = 5 * 60_000
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export interface InsightsRange {
  readonly kind: ReportRangeKind
  readonly from: string
  readonly to: string
}

const KINDS: ReadonlySet<string> = new Set<ReportRangeKind>([
  'thisWeek',
  'lastWeek',
  'thisMonth',
  'lastMonth',
  'custom',
])

function isKind(value: unknown): value is ReportRangeKind {
  return typeof value === 'string' && KINDS.has(value)
}

function readStoredRange(): InsightsRange {
  const today = todayIn(DEFAULT_REPORT_TIME_ZONE, new Date())
  const fallback: InsightsRange = { kind: 'thisWeek', from: today, to: today }
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(RANGE_STORAGE_KEY) ?? 'null')
    if (!isRecord(parsed)) {
      return fallback
    }
    const { kind, from, to } = parsed
    const isDate = (value: unknown): value is string =>
      typeof value === 'string' && DATE_PATTERN.test(value)
    return isKind(kind)
      ? { kind, from: isDate(from) ? from : today, to: isDate(to) ? to : today }
      : fallback
  } catch {
    return fallback
  }
}

// A custom range with from after to is swapped here; the server refuses it.
export function requestFor(range: InsightsRange): InsightsRequest {
  if (range.kind !== 'custom') {
    return { kind: range.kind }
  }
  const swap = range.from > range.to
  return { kind: 'custom', from: swap ? range.to : range.from, to: swap ? range.from : range.to }
}

export interface InsightsState {
  readonly range: InsightsRange
  readonly setRange: (range: InsightsRange) => void
  readonly view: InsightsView | null // the last report that was read, kept through a failed read
  readonly reading: boolean
  readonly error: unknown
  readonly reread: () => void
}

export function useInsights(): InsightsState {
  const [range, setRangeState] = useState(readStoredRange)
  const request = requestFor(range)
  const query = useQuery({
    queryKey: [...queryKeys.insights, request.kind, request.from ?? '', request.to ?? ''],
    queryFn: () => getInsights(request),
    staleTime: FIVE_MINUTES_MS,
    retry: false,
  })
  const [lastView, setLastView] = useState<InsightsView | null>(null)
  useEffect(() => {
    if (query.data !== undefined) {
      setLastView(query.data)
    }
  }, [query.data])

  function setRange(next: InsightsRange): void {
    localStorage.setItem(RANGE_STORAGE_KEY, JSON.stringify(next))
    setRangeState(next)
  }

  return {
    range,
    setRange,
    view: query.data ?? lastView,
    reading: query.isFetching,
    error: query.error,
    reread: () => {
      void query.refetch()
    },
  }
}
