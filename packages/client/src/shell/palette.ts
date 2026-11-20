import { useSyncExternalStore } from 'react'

// Open state of the command palette, shared by the Ctrl+K handler and the top bar button.
let open = false
const listeners = new Set<() => void>()

export function setPaletteOpen(next: boolean): void {
  if (next === open) {
    return
  }
  open = next
  for (const listener of listeners) {
    listener()
  }
}

export function togglePalette(): void {
  setPaletteOpen(!open)
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function usePaletteOpen(): boolean {
  return useSyncExternalStore(subscribe, () => open)
}
