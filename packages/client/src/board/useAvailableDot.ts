import { useEffect, useState } from 'react'

const SEEN_STORAGE_KEY = 'workday.seenUrgentSuggestions'

function loadSeen(): readonly string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(SEEN_STORAGE_KEY) ?? '[]')
    return Array.isArray(parsed)
      ? parsed.filter((key): key is string => typeof key === 'string')
      : []
  } catch {
    return []
  }
}

// Dot on Available while an urgent suggestion is unseen; opening the view marks the current ones seen.
export function useAvailableDot(urgentKeys: readonly string[], isOpen: boolean): boolean {
  const [seen, setSeen] = useState<readonly string[]>(loadSeen)
  const joinedKeys = urgentKeys.join(',')
  useEffect(() => {
    if (!isOpen || joinedKeys === '') {
      return
    }
    const next = joinedKeys.split(',')
    setSeen(next)
    localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify(next))
  }, [isOpen, joinedKeys])
  return !isOpen && urgentKeys.some((key) => !seen.includes(key))
}
