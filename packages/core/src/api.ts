import type { StatusFlow } from './statusFlow.js'
import type { BoardSection } from './board.js'
import type { DueUrgency, Ticket } from './ticket.js'
import type { QueueEntry } from './timesheetQueue.js'
import type { DayCoverage, HrmTask } from './timesheetWeek.js'
import type { WeekReviewItem } from './weekReview.js'

export interface JiraConfig {
  readonly baseUrl: string
  readonly email: string
  readonly projectKey: string // required, no default
  readonly assignedJql: string
  readonly mineJql: string // default "assignee = currentUser() OR assignee WAS currentUser()"
  readonly maxResults: number
  readonly etaFieldId: string | null
  readonly devPriorityFieldId: string | null
  readonly statusFlow: StatusFlow
}

export interface HrmConfig {
  readonly mcpUrl: string
  readonly projectId: string
}

export interface TscConfig {
  readonly shareUrl: string
  readonly worksheetPattern: string // "{year}" is replaced
  readonly columns: readonly string[]
  readonly headerRows: number // default 2
  readonly offMarker: string // default "OFF"
  readonly offFillColor: string // default "#FFFF00"
  readonly tokenPages: readonly string[] // pages whose Graph calls carry a Files.ReadWrite.All token, tried in order
  readonly driveId: string | null // with itemId: skips the /shares resolve
  readonly itemId: string | null
}

export interface TimesheetConfig {
  readonly logTime: string // "HH:mm", default "18:00"
  readonly hrm: HrmConfig | null
  readonly tsc: TscConfig | null
}

export interface WorkdayConfig {
  readonly host: string
  readonly port: number
  readonly timeZone: string
  readonly pollMinutes: number
  readonly theme: 'dark' | 'light'
  readonly language: 'en' | 'vi'
  readonly jira: JiraConfig | null
  readonly timesheet: TimesheetConfig
}

// Server never sends display text; the client translates the code with t().
export type AppError =
  | {
      readonly code:
        | 'invalidKey'
        | 'notConnected'
        | 'jiraRejected'
        | 'jiraUnreachable'
        | 'pollFailed'
        | 'timesheetNotConfigured'
        | 'invalidTicket'
        | 'overEightHours'
        | 'hrmClosedForToday'
        | 'tscNoToken'
        | 'tscDateMismatch'
        | 'tscFailed'
        | 'chromeMissing'
        | 'browserBusy'
        | 'hrmRejected'
        | 'hrmUnreachable'
    }
  | { readonly code: 'notFound' | 'alreadyOnBoard'; readonly key: string }

export type JiraTokenSource = 'env' | 'file' | null

export interface SettingsView {
  readonly config: Omit<WorkdayConfig, 'host'>
  readonly jiraTokenSource: JiraTokenSource // never the token itself
  readonly hrmKeySource: 'env' | 'file' | null // never the key itself
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
  readonly timesheet?: TimesheetConfig
  readonly hrmApiKey?: string
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

export type StepOutcome =
  | { readonly status: 'ok' | 'skipped' }
  | { readonly status: 'failed'; readonly error: AppError; readonly detail: string | null }

export interface EntryOutcome {
  readonly date: string
  readonly tsc: StepOutcome
  readonly hrm: StepOutcome
}

export type RunSummary = {
  readonly at: string // ISO instant
  readonly trigger: 'schedule' | 'catchUp' | 'user'
} & (
  | {
      readonly kind: 'drained'
      readonly logged: number
      readonly kept: readonly EntryOutcome[]
      readonly timedOut: boolean
    }
  | {
      readonly kind: 'reminder' | 'weekend' | 'dayOff' | 'nothingDue' | 'notConfigured' | 'joined'
    }
)

export interface WeekState {
  readonly monday: string
  readonly reading: boolean
  readonly coverage: readonly DayCoverage[] | null
  readonly review: readonly WeekReviewItem[] | null
  readonly hrmTasks: readonly HrmTask[] | null
  readonly readAt: string | null
}

export interface TimesheetView {
  readonly tscConnected: boolean
  readonly hrmConnected: boolean
  readonly logTime: string
  readonly today: string
  readonly queue: readonly QueueEntry[]
  readonly draining: boolean
  readonly lastRun: RunSummary | null
  readonly week: WeekState | null
}

export interface TicketCheck {
  readonly key: string
  readonly status: 'valid' | 'notFound' | 'unknown'
  readonly summary: string | null
  readonly isMine: boolean | null // null = not asked or Jira failed
  readonly suggestedKey: string | null
}

export type ServerEvent =
  | { readonly type: 'board.changed' }
  | { readonly type: 'settings.changed' }
  | { readonly type: 'timesheet.changed' }

// detail: the upstream text, untranslated, for a tooltip.
export type TscSessionResult =
  { readonly signedIn: boolean } | { readonly error: AppError; readonly detail: string | null }
export type TscSignInResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: AppError; readonly detail: string | null }
