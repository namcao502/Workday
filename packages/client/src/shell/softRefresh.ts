import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { inAppWindow } from './appHash.js'
import { CHECK_VERSION_EVENT } from './newVersion.js'

// F5 and Ctrl+R; Ctrl+F5 and Ctrl+Shift+R stay real reloads.
export function isSoftRefreshKey(event: KeyboardEvent): boolean {
  if (event.key === 'F5') {
    return !event.ctrlKey && !event.shiftKey && !event.metaKey
  }
  return (
    (event.ctrlKey || event.metaKey) &&
    !event.shiftKey &&
    !event.altKey &&
    event.key.toLowerCase() === 'r'
  )
}

// In the app window a page reload made Edge raise another Edge window, so F5 refetches every query instead
// and asks whether a newer build is out (UpdateBanner then offers the one real reload).
export function useSoftRefresh(): void {
  const queryClient = useQueryClient()
  useEffect(() => {
    if (!inAppWindow()) {
      return
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (!isSoftRefreshKey(event)) {
        return
      }
      event.preventDefault()
      void queryClient.invalidateQueries()
      window.dispatchEvent(new Event(CHECK_VERSION_EVENT))
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
    }
  }, [queryClient])
}
