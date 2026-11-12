import { useSyncExternalStore } from 'react'

const NARROW_QUERY = '(max-width: 719px)'

function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia(NARROW_QUERY)
  media.addEventListener('change', onChange)
  return () => {
    media.removeEventListener('change', onChange)
  }
}

function readNarrow(): boolean {
  return window.matchMedia(NARROW_QUERY).matches
}

export function useNarrow(): boolean {
  return useSyncExternalStore(subscribe, readNarrow)
}
