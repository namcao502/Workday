import { useState } from 'react'

export const SIDEBAR_STORAGE_KEY = 'workday.sidebarCollapsed'

function readCollapsed(): boolean {
  return localStorage.getItem(SIDEBAR_STORAGE_KEY) === '1'
}

// The WPF app persists this as AppSettings.SidebarCollapsed; here it is a per-browser setting.
export function useSidebarCollapsed(): readonly [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const toggle = (): void => {
    const next = !collapsed
    localStorage.setItem(SIDEBAR_STORAGE_KEY, next ? '1' : '0')
    setCollapsed(next)
  }
  return [collapsed, toggle]
}
