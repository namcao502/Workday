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
  const name = hash.replace(/^#\/?/, '')
  return PAGE_IDS.find((page) => page === name) ?? DEFAULT_PAGE
}

export function navigateTo(page: PageId): void {
  window.location.hash = `#/${page}`
}
