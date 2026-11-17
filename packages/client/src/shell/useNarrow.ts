import { useSyncExternalStore } from 'react'

const NARROW_QUERY = '(max-width: 719px)'

// An environment without matchMedia (a test DOM) is never narrow.
function mediaList(): MediaQueryList | null {
  return typeof window.matchMedia === 'function' ? window.matchMedia(NARROW_QUERY) : null
}

function subscribe(onChange: () => void): () => void {
  const media = mediaList()
  media?.addEventListener('change', onChange)
  return () => {
    media?.removeEventListener('change', onChange)
  }
}

function readNarrow(): boolean {
  return mediaList()?.matches ?? false
}

export function useNarrow(): boolean {
  return useSyncExternalStore(subscribe, readNarrow)
}
