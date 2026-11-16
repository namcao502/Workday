import { Spinner } from '@heroui/react'
import { useIsFetching, useIsMutating } from '@tanstack/react-query'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { pendingActions, subscribePending } from '../api/pendingActions.js'
import { t } from '../i18n.js'

const SHOW_DELAY_MS = 150 // a quick answer never flashes the icon
const MIN_SHOW_MS = 500 // once shown it stays long enough to be seen

// Spins while something the user asked for is loading or running: a first load of a query, or an action.
// Background refreshes of data already on screen stay quiet. The slot keeps its size, so nothing shifts.
export function GlobalLoading(): React.JSX.Element {
  const loading = useIsFetching({ predicate: (query) => query.state.data === undefined })
  const mutating = useIsMutating()
  const actions = useSyncExternalStore(subscribePending, pendingActions)
  const busy = loading + mutating + actions > 0
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

  return (
    <span className="flex size-6 items-center justify-center">
      {shown ? <Spinner size="sm" aria-label={t('Working...', 'Đang xử lý...')} /> : null}
    </span>
  )
}
