import { useEffect } from 'react'

// Used where the browser has no requestIdleCallback (Safari): late enough to stay out of the first paint.
const FALLBACK_DELAY_MS = 2000

type Loader = () => Promise<unknown>

// Starts every loader once the browser is idle after the first render, so a lazy page opens without a wait.
export function useIdlePreload(loaders: readonly Loader[]): void {
  useEffect(() => {
    const run = (): void => {
      for (const load of loaders) {
        // A failed preload is not an error yet: the page's own lazy import retries and reports it on open.
        load().catch(() => undefined)
      }
    }
    if (typeof window.requestIdleCallback === 'function') {
      const handle = window.requestIdleCallback(run)
      return () => {
        window.cancelIdleCallback(handle)
      }
    }
    const timer = window.setTimeout(run, FALLBACK_DELAY_MS)
    return () => {
      window.clearTimeout(timer)
    }
  }, [loaders])
}
