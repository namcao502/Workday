import type { BoardRow, WorkspaceView } from '@workday/core'
import { t } from '../i18n.js'
import { navigateToSettings, type SettingsGroupId } from '../settings/settingsNav.js'
import { navigateTo, navigateToWorkspace, PAGE_IDS, pageLabel, type PageId } from './pages.js'

export type PaletteSection = 'pages' | 'settings' | 'recent' | 'tickets' | 'workspace'

export interface PaletteItem {
  readonly id: string
  readonly section: PaletteSection
  readonly label: string
  readonly detail: string | null
  readonly keywords: string
  readonly page: PageId | null // the icon of a page row
  readonly jiraUrl: string | null // set on a ticket row: Alt+Enter opens it
  readonly run: () => void
}

export interface PaletteSource {
  readonly rows: readonly BoardRow[] // board rows, dismissed ones included
  readonly workspace: WorkspaceView | undefined
  readonly jiraBaseUrl: string | null
}

const RECENT_LIMIT = 5
const TICKET_LIMIT = 20

const SETTINGS_GROUPS: readonly (readonly [SettingsGroupId, () => string])[] = [
  ['general', () => t('settings.general')],
  ['integrations', () => t('settings.integrations')],
  ['work', () => t('settings.work')],
  ['remote', () => t('settings.remoteAccess')],
  ['guide', () => t('settings.guide')],
]

export const SECTION_ORDER: readonly PaletteSection[] = [
  'pages',
  'settings',
  'recent',
  'tickets',
  'workspace',
]

export function sectionTitle(section: PaletteSection): string {
  switch (section) {
    case 'pages':
      return t('palette.pages')
    case 'settings':
      return t('palette.settingsGroups')
    case 'recent':
      return t('palette.recentTickets')
    case 'tickets':
      return t('palette.tickets')
    case 'workspace':
      return t('palette.workspace')
  }
}

function pageItems(): readonly PaletteItem[] {
  return PAGE_IDS.map((page) => ({
    id: `page:${page}`,
    section: 'pages',
    label: pageLabel(page),
    detail: null,
    keywords: page,
    page,
    jiraUrl: null,
    run: () => {
      navigateTo(page)
    },
  }))
}

function settingsItems(): readonly PaletteItem[] {
  return SETTINGS_GROUPS.map(([group, label]) => ({
    id: `settings:${group}`,
    section: 'settings',
    label: label(),
    detail: pageLabel('settings'),
    keywords: `${group} ${pageLabel('settings')}`,
    page: 'settings',
    jiraUrl: null,
    run: () => {
      navigateToSettings(group)
    },
  }))
}

function ticketItems(
  rows: readonly BoardRow[],
  jiraBaseUrl: string | null,
  section: 'recent' | 'tickets',
): readonly PaletteItem[] {
  return rows.map((row) => ({
    id: `${section}:${row.ticket.key}`,
    section,
    label: row.ticket.key,
    detail: row.ticket.summary,
    keywords: `${row.ticket.key} ${row.ticket.summary}`,
    page: null,
    jiraUrl: jiraBaseUrl === null ? null : `${jiraBaseUrl}/browse/${row.ticket.key}`,
    run: () => {
      navigateToWorkspace(row.ticket.key)
    },
  }))
}

function workspaceItems(workspace: WorkspaceView | undefined): readonly PaletteItem[] {
  if (workspace === undefined || !workspace.configured) {
    return []
  }
  return workspace.tabs.flatMap((tab) => [
    {
      id: `tab:${tab.id}`,
      section: 'workspace' as const,
      label: tab.id,
      detail: t('palette.tab'),
      keywords: tab.id,
      page: 'workspace' as const,
      jiraUrl: null,
      run: () => {
        navigateToWorkspace(tab.id)
      },
    },
    ...tab.sessions.slice(1).map((name) => ({
      id: `session:${name}`,
      section: 'workspace' as const,
      label: name,
      detail: t('palette.session'),
      keywords: name,
      page: 'workspace' as const,
      jiraUrl: null,
      run: () => {
        navigateToWorkspace(tab.id, name)
      },
    })),
  ])
}

function matches(item: PaletteItem, needle: string): boolean {
  return `${item.label} ${item.keywords}`.toLowerCase().includes(needle)
}

// Empty query: pages and the newest tickets. Otherwise every section, filtered by substring.
export function buildItems(source: PaletteSource, query: string): readonly PaletteItem[] {
  const needle = query.trim().toLowerCase()
  const rows = source.rows.filter((row) => row.section !== 'dismissed')
  if (needle === '') {
    const newest = [...rows].sort((a, b) =>
      (b.ticket.updated ?? '').localeCompare(a.ticket.updated ?? ''),
    )
    const recent = ticketItems(newest.slice(0, RECENT_LIMIT), source.jiraBaseUrl, 'recent')
    return [...pageItems(), ...recent]
  }
  const all = [
    ...pageItems(),
    ...settingsItems(),
    ...ticketItems(rows, source.jiraBaseUrl, 'tickets'),
    ...workspaceItems(source.workspace),
  ].filter((item) => matches(item, needle))
  const tickets = all.filter((item) => item.section === 'tickets').slice(0, TICKET_LIMIT)
  return SECTION_ORDER.flatMap((section) =>
    section === 'tickets' ? tickets : all.filter((item) => item.section === section),
  )
}
