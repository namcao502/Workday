import { useSyncExternalStore } from 'react'

// Why this screen lost the PC's one-screen slot; 'ok' while it holds it.
export type SessionState = 'ok' | 'takenByApp' | 'takenByTab'

let state: SessionState = 'ok'
const listeners = new Set<() => void>()

export function setSession(next: SessionState): void {
  if (next === state) {
    return
  }
  state = next
  for (const listener of listeners) {
    listener()
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useSession(): SessionState {
  return useSyncExternalStore(subscribe, () => state)
}
