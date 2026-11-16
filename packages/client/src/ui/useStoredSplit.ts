import { useState } from 'react'

export type SplitHidden = 'none' | 'left' | 'right'

export interface StoredSplit {
  readonly share: number | null // the left pane's fraction once dragged; null = the default
  readonly hidden: SplitHidden
}

export const MIN_SHARE = 0.1
export const MAX_SHARE = 0.9
const STORAGE_PREFIX = 'workday.split.'
const DEFAULT_SPLIT: StoredSplit = { share: null, hidden: 'none' }

// A share outside [0.1, 0.9] (a hand-edited value) falls back to the default, as the WPF app does.
export function validShare(share: unknown): number | null {
  return typeof share === 'number' && share >= MIN_SHARE && share <= MAX_SHARE ? share : null
}

function isHidden(value: unknown): value is SplitHidden {
  return value === 'none' || value === 'left' || value === 'right'
}

function read(key: string): StoredSplit {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_PREFIX + key) ?? 'null')
    if (typeof parsed !== 'object' || parsed === null) {
      return DEFAULT_SPLIT
    }
    const record = parsed as Record<string, unknown>
    return {
      share: validShare(record['share']),
      hidden: isHidden(record['hidden']) ? record['hidden'] : 'none',
    }
  } catch {
    return DEFAULT_SPLIT
  }
}

function write(key: string, split: StoredSplit): void {
  // A split back at the default drops its entry, so storage does not grow with every ticket ever opened.
  if (split.share === null && split.hidden === 'none') {
    localStorage.removeItem(STORAGE_PREFIX + key)
  } else {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(split))
  }
}

export interface SplitControl extends StoredSplit {
  readonly setShare: (share: number | null) => void
  readonly setHidden: (hidden: SplitHidden) => void
}

// One split's share and hidden pane, kept per key in localStorage; a new key loads that key's own state.
export function useStoredSplit(key: string): SplitControl {
  const [state, setState] = useState(() => ({ key, split: read(key) }))
  const current = state.key === key ? state.split : read(key)
  function update(changes: Partial<StoredSplit>): void {
    const next = { ...current, ...changes }
    write(key, next)
    setState({ key, split: next })
  }
  return {
    ...current,
    setShare: (share) => {
      update({ share })
    },
    setHidden: (hidden) => {
      update({ hidden })
    },
  }
}
