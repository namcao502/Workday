import { useIsFetching, useIsMutating, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { pendingActions, subscribePending } from '../api/pendingActions.js'
import { actionLabel, loadLabel } from '../api/workLabels.js'

const SHOW_DELAY_MS = 150 // a quick answer never flashes the icon
const MIN_SHOW_MS = 500 // once shown it stays long enough to be seen

// True while a first load or an action runs (the bell spins, as in WPF); refreshes stay quiet.
export function useGlobalBusy(): boolean {
  const loading = useIsFetching({ predicate: (query) => query.state.data === undefined })
  const mutating = useIsMutating()
  const actions = useSyncExternalStore(subscribePending, pendingActions)
  const busy = loading + mutating + actions.length > 0
  const [shown, setShown] = useState(false)
  const shownAt = useRef(0)

  useEffect(() => {
    if (busy === shown) {
      return undefined
    }
    const wait = busy ? SHOW_DELAY_MS : Math.max(0, MIN_SHOW_MS - (Date.now() - shownAt.current))
    const timer = setTimeout(() => {
      shownAt.current = Date.now()
      setShown(busy)
    }, wait)
    return () => {
      clearTimeout(timer)
    }
  }, [busy, shown])

  return shown
}

// The running work by name for the bell's list: actions in flight, then first loads, each once.
export function useRunningWork(): readonly string[] {
  const queryClient = useQueryClient()
  const actions = useSyncExternalStore(subscribePending, pendingActions)
  // Re-renders when the count of first loads changes; the names are then read from the cache.
  useIsFetching({ predicate: (query) => query.state.data === undefined })
  const loads = queryClient
    .getQueryCache()
    .findAll({ fetchStatus: 'fetching', predicate: (query) => query.state.data === undefined })
    .map((query) => loadLabel(query.queryKey))
  return [...new Set([...actions.map(actionLabel), ...loads])]
}
