import { useSyncExternalStore } from 'react'

// Prompts sent to a session that the transcript does not hold yet. The chat shows them at once; Claude writes the
// transcript only after its process has started, which can take seconds.
const EMPTY: readonly string[] = []
const echoes = new Map<string, readonly string[]>()
const listeners = new Set<() => void>()

function emit(): void {
  listeners.forEach((listener) => {
    listener()
  })
}

export function addEcho(session: string, text: string): void {
  echoes.set(session, [...(echoes.get(session) ?? EMPTY), text])
  emit()
}

// Drops the first `count` echoes (the transcript caught up with them); no count drops all (a failed send).
export function dropEchoes(session: string, count?: number): void {
  const rest = count === undefined ? EMPTY : (echoes.get(session) ?? EMPTY).slice(count)
  if (rest.length === 0) {
    echoes.delete(session)
  } else {
    echoes.set(session, rest)
  }
  emit()
}

export function useEchoes(session: string): readonly string[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    () => echoes.get(session) ?? EMPTY,
  )
}
