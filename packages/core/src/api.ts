import type { StatusFlow } from './statusFlow.js'
import type { BoardSection } from './board.js'
import type { DueUrgency, Ticket } from './ticket.js'

export interface JiraConfig {
  readonly baseUrl: string
  readonly email: string
  readonly projectKey: string // required, no default
  readonly assignedJql: string
  readonly maxResults: number
  readonly etaFieldId: string | null
  readonly devPriorityFieldId: string | null
  readonly statusFlow: StatusFlow
}

export interface WorkdayConfig {
  readonly host: string
  readonly port: number
  readonly timeZone: string
  readonly pollMinutes: number
  readonly theme: 'dark' | 'light'
  readonly language: 'en' | 'vi'
  readonly jira: JiraConfig | null
}

// Server never sends display text; the client translates the code with t().
export type AppError =
  | {
      readonly code:
        'invalidKey' | 'notConnected' | 'jiraRejected' | 'jiraUnreachable' | 'pollFailed'
    }
  | { readonly code: 'notFound' | 'alreadyOnBoard'; readonly key: string }

export type JiraTokenSource = 'env' | 'file' | null

export interface SettingsView {
  readonly config: Omit<WorkdayConfig, 'host'>
  readonly jiraTokenSource: JiraTokenSource // never the token itself
}

// Replaces each top-level field it carries; jira: null disconnects; jiraApiToken omitted keeps the saved token.
export interface SettingsUpdate {
  readonly port?: number
  readonly timeZone?: string
  readonly pollMinutes?: number
  readonly theme?: 'dark' | 'light'
  readonly language?: 'en' | 'vi'
  readonly jira?: JiraConfig | null
  readonly jiraApiToken?: string
}

export interface JiraCheckRequest {
  readonly baseUrl: string
  readonly email: string
  readonly jiraApiToken?: string
}

export type JiraCheckResult =
  | { readonly ok: true; readonly displayName: string }
  | { readonly ok: false; readonly error: AppError }

export interface BoardRow {
  readonly ticket: Ticket
  readonly section: BoardSection | 'dismissed'
  readonly dueUrgency: DueUrgency
  readonly url: string
}

export interface LastPoll {
  readonly at: string // ISO instant
  readonly ok: boolean
  readonly error: AppError | null
}

export interface BoardView {
  readonly connected: boolean
  readonly lastPoll: LastPoll | null
  readonly today: string // "YYYY-MM-DD" in config.timeZone
  readonly rows: readonly BoardRow[]
}

export interface AddTicketRequest {
  readonly input: string
}

export type AddTicketResult =
  { readonly ok: true } | { readonly ok: false; readonly error: AppError }

export type BoardAction = 'done' | 'reopen' | 'dismiss' | 'restore'

export type ServerEvent = { readonly type: 'board.changed' } | { readonly type: 'settings.changed' }
