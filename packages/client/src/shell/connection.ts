import { useSyncExternalStore } from 'react'

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting'

// State of the /api/events socket, shared by useEvents and the top bar indicator.
let status: ConnectionStatus = 'connecting'
const listeners = new Set<() => void>()

export function setConnectionStatus(next: ConnectionStatus): void {
  if (next === status) {
    return
  }
  status = next
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

export function useConnectionStatus(): ConnectionStatus {
  return useSyncExternalStore(subscribe, () => status)
}
