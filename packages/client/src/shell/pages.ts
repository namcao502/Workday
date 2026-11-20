import { t } from '../i18n.js'
import { setHash } from './appHash.js'

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
      return t('shell.tickets')
    case 'workspace':
      return t('shell.workspace')
    case 'timesheet':
      return t('shell.timesheet')
    case 'insights':
      return t('shell.insights')
    case 'settings':
      return t('shell.settings')
  }
}

// "#/settings" -> "settings"; anything unknown falls back to the default page.
export function pageFromHash(hash: string): PageId {
  const name = hash.replace(/^#\/?/, '').split('?')[0]?.split('/')[0]
  return PAGE_IDS.find((page) => page === name) ?? DEFAULT_PAGE
}

export function navigateTo(page: PageId): void {
  setHash(`#/${page}`)
}

export interface WorkspaceSelection {
  readonly tab: string | null
  readonly session: string | null
}

// "#/workspace/MDP-1/MDP-1~2" -> { tab: "MDP-1", session: "MDP-1~2" }; the selection lives only in the URL.
export function workspaceSelectionFromHash(hash: string): WorkspaceSelection {
  const [, tab, session] = hash.replace(/^#\/?/, '').split('?')[0]?.split('/') ?? []
  return {
    tab: tab === undefined || tab === '' ? null : decodeURIComponent(tab),
    session: session === undefined || session === '' ? null : decodeURIComponent(session),
  }
}

// "#/workspace/MDP-1?teams=<id>" -> the Teams conversation a notice points at; null when the hash has none.
export function teamsConversationFromHash(hash: string): string | null {
  const query = hash.split('?')[1]
  return query === undefined ? null : new URLSearchParams(query).get('teams')
}

// "#/tickets?update=MDP-1" -> the ticket whose Jira comparison a desktop or phone notice opens.
export function ticketUpdateFromHash(hash: string): string | null {
  const query = hash.split('?')[1]
  return query === undefined ? null : new URLSearchParams(query).get('update')
}

export function navigateToWorkspace(
  tab: string | null,
  session: string | null = null,
  teamsConversation: string | null = null,
): void {
  const parts = [tab, tab === null ? null : session].filter((part) => part !== null)
  const query =
    tab === null || teamsConversation === null
      ? ''
      : `?teams=${encodeURIComponent(teamsConversation)}`
  setHash(`#/workspace${parts.map((part) => `/${encodeURIComponent(part)}`).join('')}${query}`)
}
