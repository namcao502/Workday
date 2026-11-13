import type { DeviceRights } from './remoteAccess.js'
import type { StatusFlow } from './statusFlow.js'
import type { BoardSection } from './board.js'
import type { WaitReason } from './claudeAttention.js'
import type { DueUrgency, Ticket } from './ticket.js'
import type { WorkspaceTab } from './workspaceTabs.js'
import type { QueueEntry } from './timesheetQueue.js'
import type { DayCoverage, HrmTask } from './timesheetWeek.js'
import type { WeekReviewItem } from './weekReview.js'
import type { NoticePrefs, Notice } from './notices.js'
import type { TicketPr } from './prTracking.js'
import type { Suggestion } from './ticketSuggestions.js'
import type { TeamsThread } from './teamsChat.js'
import type { TeamsPerson } from './teamsCompose.js'
import type { TodoGroup } from './todos.js'
import type { TicketReport } from './ticketReports.js'

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
  readonly suggestions: SuggestionsConfig | null
}

export interface SuggestionsConfig {
  readonly epicJql: string
  readonly epicTitlePrefix: string // "MDP Issues - "
  readonly candidatesJql: string // "{epic}" is replaced
  readonly mineJql: string // "{epic}" is replaced
  readonly selectedStatus: string | null
}

export interface AzureDevOpsConfig {
  readonly organization: string
  readonly project: string
  readonly repoLabels: Readonly<Record<string, string>> // insertion order = display order
  readonly devPipelineFolder: string | null // "\Development-Pipelines"; null = no deploy watch
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

export interface RemoteConfig {
  readonly enabled: boolean
  readonly publicHost: string // "workday.example.com", no scheme
  readonly accessTeamDomain: string // "myteam.cloudflareaccess.com"
  readonly accessAud: string
  readonly cloudflaredPath: string | null // null = the user runs cloudflared
}

export interface WorkspaceConfig {
  readonly devRepoPath: string | null
  readonly siblingRepoGlob: string | null // "*-Angular"; null = only the dev repo
  readonly startPrompt: string | null // "ship {key}"; null = plain claude
  readonly claudeExecutable: string | null // null = ~/.local/bin/claude(.exe), else PATH
  readonly localOnlyPaths: readonly string[] // never listed in Changes
  readonly chatView: boolean
}

export interface TeamsConfig {
  readonly watchedChannels: readonly string[] // "Team > Channel"; first = default post channel; [] = Teams off
  readonly postLeadName: string | null
  readonly postGreeting: string | null // "a {lead}, da "
}

export type ScanDay = 'daily' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

export interface KnowledgeScanConfig {
  readonly enabled: boolean
  readonly command: string // "pwsh"
  readonly args: readonly string[] // ["-NoProfile", "-File", "<dev repo>/docs/local-config/daily-knowledge-scan.ps1"]
  readonly day: ScanDay
  readonly time: string // "HH:mm", on the hour 06:00-23:00
  readonly limitHours: 1 | 2 | 3 | 4 | 6
  readonly logFile: string | null // the script's own log; its new lines join the run log
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
  readonly remote: RemoteConfig | null // null until publicHost, accessTeamDomain and accessAud are all set
  readonly workspace: WorkspaceConfig
  readonly azureDevOps: AzureDevOpsConfig | null
  readonly teams: TeamsConfig
  readonly notices: NoticePrefs
  readonly knowledgeScan: KnowledgeScanConfig | null // null = no scan command set up
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
        | 'remoteDisabled'
        | 'accessRequired'
        | 'notPaired'
        | 'forbidden'
        | 'pairingClosed'
        | 'wrongCode'
        | 'workspaceNotConfigured'
        | 'worktreeMissing'
        | 'worktreeFailed'
        | 'parentBranchMissing'
        | 'mainNotMerged' // a warning: the worktree is still used
        | 'sessionNotFound'
        | 'pathOutside'
        | 'gitFailed'
        | 'adoRejected'
        | 'adoUnreachable'
        | 'adoNotConfigured'
        | 'teamsSignedOut'
        | 'teamsBusy'
        | 'teamsNotConfigured'
        | 'teamsUncertain' // a write that may have reached Teams
        | 'teamsFailed'
        | 'claudeNotRunning'
        | 'claudeWaiting' // a permission or question is open: the Enter would answer it
        | 'insightsFailed'
    }
  | { readonly code: 'notFound' | 'alreadyOnBoard'; readonly key: string }

export type JiraTokenSource = 'env' | 'file' | null

export interface SettingsView {
  readonly config: Omit<WorkdayConfig, 'host'>
  readonly jiraTokenSource: JiraTokenSource // never the token itself
  readonly hrmKeySource: 'env' | 'file' | null // never the key itself
  readonly tunnelTokenSource: 'env' | 'file' | null // never the token itself
  readonly adoPatSource: 'env' | 'file' | null // never the PAT itself
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
  readonly remote?: RemoteConfig | null
  readonly tunnelToken?: string
  readonly workspace?: WorkspaceConfig
  readonly azureDevOps?: AzureDevOpsConfig | null
  readonly teams?: TeamsConfig
  readonly adoPat?: string
  readonly notices?: NoticePrefs
  readonly knowledgeScan?: KnowledgeScanConfig | null
}

export interface JiraCheckRequest {
  readonly baseUrl: string
  readonly email: string
  readonly jiraApiToken?: string
}

export interface AdoCheckRequest {
  readonly organization: string
  readonly project: string
  readonly adoPat?: string
}

export type AdoCheckResult =
  | { readonly ok: true; readonly displayName: string }
  | { readonly ok: false; readonly error: AppError }

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
  | { readonly type: 'remote.changed' } // PC Settings refetches RemoteStatusView
  | { readonly type: 'workspace.changed' }
  | { readonly type: 'work.changed' }
  | { readonly type: 'notices.changed' }
  | { readonly type: 'schedules.changed' }

export interface SessionView {
  readonly name: string
  readonly running: boolean
  readonly wait: WaitReason | null
  readonly working: boolean
}

export interface WorkspaceView {
  readonly configured: boolean // devRepoPath set and the folder exists
  readonly tabs: readonly WorkspaceTab[]
  readonly sessions: readonly SessionView[]
  readonly starting: readonly string[] // keys whose worktree is being created
  readonly recentFolders: readonly string[]
}

// warning: mainNotMerged, the tab opens anyway.
export type StartOutcome =
  | { readonly ok: true; readonly warning: AppError | null }
  | { readonly ok: false; readonly error: AppError }

export type OpenOutcome = StartOutcome | { readonly ok: false; readonly confirmRecreate: true } // worktree missing and recreate not set

export interface PushSubscriptionJson {
  readonly endpoint: string
  readonly keys: { readonly p256dh: string; readonly auth: string }
}

export interface RemoteDevice {
  readonly id: string
  readonly name: string
  readonly email: string | null // the Cloudflare Access identity that paired it
  readonly rights: DeviceRights
  readonly pushEnabled: boolean
  readonly hasPushSubscription: boolean
  readonly createdAt: string
  readonly lastSeenAt: string | null
}

export type MeView =
  | { readonly mode: 'local' }
  | { readonly mode: 'remote'; readonly device: RemoteDevice }
  | { readonly mode: 'unpaired' }

export interface PairingView {
  readonly code: string | null // shown on the PC only
  readonly expiresAt: string | null
  readonly pending: {
    readonly name: string
    readonly email: string | null
    readonly ip: string | null
    readonly at: string
  } | null
}

export interface ActivityEntry {
  readonly at: string
  readonly deviceId: string
  readonly deviceName: string
  readonly method: string
  readonly route: string // the route pattern, never the body
  readonly status: number
}

export interface RemoteStatusView {
  readonly tunnel: 'off' | 'starting' | 'running' | 'failed'
  readonly tunnelDetail: string | null
  readonly devices: readonly RemoteDevice[]
  readonly pairing: PairingView
  readonly activity: readonly ActivityEntry[] // newest first, at most 50
  readonly vapidPublicKey: string | null
}

// detail: the upstream text, untranslated, for a tooltip.
export type TscSessionResult =
  { readonly signedIn: boolean } | { readonly error: AppError; readonly detail: string | null }
export type TscSignInResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: AppError; readonly detail: string | null }

export type ChangeStatus = 'A' | 'M' | 'D'

export interface ChangeGroupView {
  readonly id: string
  readonly label: string // "BE - Backend-DotNet", "FE - Portal-Angular", "(MDP-2)" suffix for a bug branch
  readonly files: readonly { readonly path: string; readonly status: ChangeStatus }[]
  readonly error: AppError | null
}

export type DiffView =
  | { readonly kind: 'full'; readonly original: string; readonly modified: string }
  | {
      readonly kind: 'excerpt'
      readonly original: string
      readonly modified: string
      readonly originalLines: readonly number[]
      readonly modifiedLines: readonly number[]
      readonly truncated: boolean
    }
  | { readonly kind: 'binary' }

export interface FilesGroupView {
  readonly id: string
  readonly label: string
  readonly paths: readonly string[]
  readonly error: AppError | null
}

export type FileContentView =
  | { readonly kind: 'text' | 'markdown'; readonly text: string }
  | { readonly kind: 'image' } // the client loads .../files/raw
  | { readonly kind: 'binary' | 'tooLarge' }

export interface WorkView {
  readonly adoConnected: boolean
  readonly lastPrCheck: { readonly at: string; readonly ok: boolean } | null
  readonly groups: readonly TodoGroup[]
  readonly attention: number // attentionKeys(groups).length
  readonly prs: Readonly<Record<string, readonly TicketPr[]>> // per board ticket
  readonly readyToTest: Readonly<Record<string, readonly string[]>> // keys with steps left
  readonly suggestions: {
    readonly epicKey: string | null
    readonly items: readonly Suggestion[]
  } | null // null = not configured
}

export interface NoticesView {
  readonly notices: readonly Notice[]
  readonly unread: number
  readonly prefs: NoticePrefs
}

export type ReadyToTestOutcome =
  | { readonly status: 'moved' | 'alreadyPast' | 'notFound' | 'busy' }
  | { readonly status: 'failed'; readonly step: string }

export type TakeOutcome = { readonly ok: true } | { readonly ok: false; readonly holder: string }

// A watched channel (its post) or one of the ticket's group chats; posted: the ticket has a post there.
export interface TeamsOption {
  readonly id: string
  readonly label: string
  readonly kind: 'channel' | 'chat'
  readonly posted: boolean
}

// searching: the deep scan is unfinished, the client reads again in 5 s.
export type TeamsConversationView =
  | { readonly state: 'signedOut' | 'notConfigured' }
  | { readonly state: 'searching'; readonly options: readonly TeamsOption[] }
  | {
      readonly state: 'notPosted'
      readonly options: readonly TeamsOption[]
      readonly channelId: string
      readonly draft: { readonly subject: string; readonly body: string; readonly bodyHtml: string }
      readonly posted: boolean
    }
  | {
      readonly state: 'thread'
      readonly options: readonly TeamsOption[]
      readonly conversationId: string
      readonly thread: TeamsThread
      readonly myId: string
      readonly people: readonly TeamsPerson[]
      readonly deepLink: string
    }

// The read plus the conversation ids of the ticket with a message waiting.
export type TeamsReadView = TeamsConversationView & { readonly pending: readonly string[] }

export type TeamsWriteResult =
  | { readonly ok: true; readonly id: string | null }
  | { readonly ok: false; readonly error: AppError }

export interface TeamsStatusView {
  readonly configured: boolean
  readonly signedIn: boolean | null // null = not asked yet or not configured
}

export interface InsightsView {
  readonly report: TicketReport
  readonly readAt: string
}

export type ScanOutcome = 'running' | 'ok' | 'withProblems' | 'stopped' | 'failed'

export interface ScanRun {
  readonly id: string
  readonly startedAt: string
  readonly endedAt: string | null
  readonly outcome: ScanOutcome
  readonly exitCode: number | null
  readonly found: number
  readonly mined: number
  readonly refreshed: number
  readonly problemLines: readonly string[]
  readonly trigger: 'schedule' | 'user'
}

export type AppJobName = 'jiraPoll' | 'prCheck' | 'teamsCheck' | 'timesheetRun' | 'catchUp'

export interface JobRun {
  readonly startedAt: string
  readonly endedAt: string
  readonly ok: boolean
  readonly summary: string | null
}

export interface SchedulesView {
  readonly scan: {
    readonly config: KnowledgeScanConfig | null
    readonly nextRunAt: string | null
    readonly runs: readonly ScanRun[]
    readonly unseenBad: boolean
  }
  readonly jobs: Readonly<
    Record<AppJobName, { readonly runs: readonly JobRun[]; readonly nextRunAt: string | null }>
  >
}

export type StartScanResult = { readonly ok: true } | { readonly ok: false; readonly busy: true }

export interface ScanLogChunk {
  readonly text: string
  readonly next: number // the byte offset to read from next
}
