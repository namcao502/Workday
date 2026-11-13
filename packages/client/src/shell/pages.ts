import type { RemoteArea } from '@workday/core'
import type { Access } from '../api/useMe.js'
import { t } from '../i18n.js'

export type PageId = 'tickets' | 'workspace' | 'timesheet' | 'insights' | 'settings'

export const PAGE_IDS: readonly PageId[] = [
  'tickets',
  'workspace',
  'timesheet',
  'insights',
  'settings',
]

export const DEFAULT_PAGE: PageId = 'tickets'

export function pageLabel(page: PageId): string {
  switch (page) {
    case 'tickets':
      return t('Tickets', 'Ticket')
    case 'workspace':
      return t('Workspace', 'Không gian làm việc')
    case 'timesheet':
      return t('Timesheet', 'Bảng công')
    case 'insights':
      return t('Insights', 'Thống kê')
    case 'settings':
      return t('Settings', 'Cài đặt')
  }
}

// "#/settings" -> "settings"; anything unknown falls back to the default page.
export function pageFromHash(hash: string): PageId {
  const name = hash.replace(/^#\/?/, '').split('/')[0]
  return PAGE_IDS.find((page) => page === name) ?? DEFAULT_PAGE
}

export function navigateTo(page: PageId): void {
  window.location.hash = `#/${page}`
}

// Workspace and Insights have no remote area yet, so a remote device never sees them.
const PAGE_AREAS: Partial<Record<PageId, RemoteArea>> = { tickets: 'board', timesheet: 'timesheet' }

export function pageVisible(page: PageId, access: Access): boolean {
  if (access.mode !== 'remote' || page === 'settings') {
    return true
  }
  const area = PAGE_AREAS[page]
  return area !== undefined && access.canSee(area)
}

export function visiblePages(access: Access): readonly PageId[] {
  return PAGE_IDS.filter((page) => pageVisible(page, access))
}

export interface WorkspaceSelection {
  readonly tab: string | null
  readonly session: string | null
}

// "#/workspace/MDP-1/MDP-1~2" -> { tab: "MDP-1", session: "MDP-1~2" }; the selection lives only in the URL.
export function workspaceSelectionFromHash(hash: string): WorkspaceSelection {
  const [, tab, session] = hash.replace(/^#\/?/, '').split('/')
  return {
    tab: tab === undefined || tab === '' ? null : decodeURIComponent(tab),
    session: session === undefined || session === '' ? null : decodeURIComponent(session),
  }
}

export function navigateToWorkspace(tab: string | null, session: string | null = null): void {
  const parts = [tab, tab === null ? null : session].filter((part) => part !== null)
  window.location.hash = `#/workspace${parts.map((part) => `/${encodeURIComponent(part)}`).join('')}`
}
