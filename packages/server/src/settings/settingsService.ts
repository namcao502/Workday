import type {
  AppError,
  HoursLog,
  HrmConfig,
  JiraCheckRequest,
  JiraCheckResult,
  JiraConfig,
  SettingsUpdate,
  SettingsView,
  SheetLog,
  TicketTracker,
  TscConfig,
  TscSessionResult,
  TscSignInResult,
  WorkdayConfig,
} from '@workday/core'
import type { BoardService } from '../board/boardService.js'
import {
  DEFAULT_OFF_MARKER,
  loadHrmKey,
  loadJiraToken,
  readFileSecrets,
  saveConfig,
  saveSecrets,
  type HrmKey,
  type JiraToken,
} from '../config.js'
import type { EventSink } from '../events.js'
import type { LogTimer } from '../timesheet/logScheduler.js'
import { sheetAppError } from '../timesheet/logEntry.js'
import type { TimesheetService } from '../timesheet/timesheetService.js'
import { sameBaseUrl, type HrmCheckRequest } from './parseSettings.js'

export interface Scheduler {
  start(pollMinutes: number): void
  stop(): void
}

export interface SettingsServiceDeps {
  readonly dataDir: string
  readonly config: WorkdayConfig
  readonly board: BoardService
  readonly scheduler: Scheduler
  readonly events: EventSink
  readonly createTracker: (jira: JiraConfig, token: string) => TicketTracker
  readonly timesheet: TimesheetService
  readonly logScheduler: LogTimer
  readonly createHoursLog: (hrm: HrmConfig, apiKey: string) => HoursLog
  readonly createSheetLog: (tsc: TscConfig) => SheetLog
  readonly logError?: (message: string, error: unknown) => void
}

// tokenRequired: the update names a Jira host the saved token was not given for, and carries no token.
export type UpdateOutcome =
  | { readonly ok: true; readonly view: SettingsView }
  | { readonly ok: false; readonly reason: 'tokenRequired' }

export type HrmCheckResult =
  { readonly ok: true } | { readonly ok: false; readonly error: AppError }

interface AppliedState {
  readonly config: WorkdayConfig
  readonly token: string | null
  readonly hrmKey: string | null
}

const NOT_CONFIGURED: AppError = { code: 'timesheetNotConfigured' }

const CHECK_ONLY_JIRA: Omit<JiraConfig, 'baseUrl' | 'email'> = {
  projectKey: '',
  assignedJql: '',
  mineJql: '',
  maxResults: 1,
  etaFieldId: null,
  devPriorityFieldId: null,
  statusFlow: { preWorkStatuses: [], reworkStatuses: [] },
}

export class SettingsService {
  private config: WorkdayConfig
  private jiraToken: JiraToken
  private hrmKey: HrmKey
  private tracker: TicketTracker | null = null
  private hours: HoursLog | null = null
  private sheet: SheetLog | null = null
  private updates: Promise<unknown> = Promise.resolve()

  constructor(private readonly deps: SettingsServiceDeps) {
    this.config = deps.config
    this.jiraToken = loadJiraToken(deps.dataDir)
    this.hrmKey = loadHrmKey(deps.dataDir)
  }

  // Builds the tracker and starts polling from the loaded config; called once at startup.
  start(): void {
    this.apply(null)
  }

  view(): SettingsView {
    const { port, timeZone, pollMinutes, theme, language, jira, timesheet } = this.config
    return {
      config: { port, timeZone, pollMinutes, theme, language, jira, timesheet },
      jiraTokenSource: this.jiraToken.source,
      hrmKeySource: this.hrmKey.source,
    }
  }

  update(update: SettingsUpdate): Promise<UpdateOutcome> {
    const run = this.updates.then(() => this.runUpdate(update))
    this.updates = run.catch(() => undefined)
    return run
  }

  // The saved token goes only to the base URL it was saved for.
  async checkJira(request: JiraCheckRequest): Promise<JiraCheckResult | 'tokenRequired'> {
    const savedJira = this.config.jira
    const canUseSavedToken = savedJira !== null && sameBaseUrl(savedJira.baseUrl, request.baseUrl)
    const token = request.jiraApiToken ?? (canUseSavedToken ? this.jiraToken.token : null)
    if (token === null) {
      return 'tokenRequired'
    }
    const jira = {
      ...(savedJira ?? CHECK_ONLY_JIRA),
      baseUrl: request.baseUrl,
      email: request.email,
    }
    const validation = await this.deps.createTracker(jira, token).validate()
    if (validation.ok) {
      return { ok: true, displayName: validation.displayName }
    }
    const code = validation.reason === 'rejected' ? 'jiraRejected' : 'jiraUnreachable'
    return { ok: false, error: { code } }
  }

  // The saved key goes only to the MCP URL it was saved for.
  async checkHrm(request: HrmCheckRequest): Promise<HrmCheckResult | 'tokenRequired'> {
    const savedHrm = this.config.timesheet.hrm
    const canUseSavedKey = savedHrm !== null && sameBaseUrl(savedHrm.mcpUrl, request.mcpUrl)
    const apiKey = request.hrmApiKey ?? (canUseSavedKey ? this.hrmKey.key : null)
    if (apiKey === null) {
      return 'tokenRequired'
    }
    const hrm = { mcpUrl: request.mcpUrl, projectId: savedHrm?.projectId ?? '' }
    const validation = await this.deps.createHoursLog(hrm, apiKey).validate()
    if (validation.ok) {
      return { ok: true }
    }
    const code = validation.reason === 'rejected' ? 'hrmRejected' : 'hrmUnreachable'
    return { ok: false, error: { code } }
  }

  async checkTscSession(): Promise<TscSessionResult> {
    if (this.sheet === null) {
      return { error: NOT_CONFIGURED, detail: null }
    }
    const session = await this.sheet.checkSession()
    return 'signedIn' in session
      ? { signedIn: session.signedIn }
      : { error: sheetAppError(session), detail: session.detail }
  }

  // A fresh session may unblock days kept by an earlier run, so a successful sign-in runs the catch-up.
  async signInTsc(): Promise<TscSignInResult> {
    if (this.sheet === null) {
      return { ok: false, error: NOT_CONFIGURED, detail: null }
    }
    const result = await this.sheet.signIn()
    if (!result.ok) {
      return { ok: false, error: sheetAppError(result), detail: result.detail }
    }
    this.deps.timesheet.catchUp().catch((error: unknown) => {
      this.logError('Catch-up after the TSC sign-in failed', error)
    })
    return { ok: true }
  }

  private async runUpdate(update: SettingsUpdate): Promise<UpdateOutcome> {
    if (this.wouldSendTokenElsewhere(update) || this.wouldSendHrmKeyElsewhere(update)) {
      return { ok: false, reason: 'tokenRequired' }
    }
    const previous: AppliedState = {
      config: this.config,
      token: this.jiraToken.token,
      hrmKey: this.hrmKey.key,
    }
    const { jiraApiToken, hrmApiKey, ...configFields } = update
    const nextConfig = { ...this.config, ...configFields }
    // Both files are written before memory changes, so a failed write leaves the running settings as they were.
    await saveConfig(this.deps.dataDir, nextConfig)
    if (jiraApiToken !== undefined || hrmApiKey !== undefined) {
      await this.saveSecretsOrRollBack({ jiraApiToken, hrmApiKey }, previous.config)
    }
    this.jiraToken = loadJiraToken(this.deps.dataDir)
    this.hrmKey = loadHrmKey(this.deps.dataDir)
    this.config = nextConfig
    this.apply(previous)
    this.deps.events.broadcast({ type: 'settings.changed' })
    return { ok: true, view: this.view() }
  }

  // A config naming the new host beside the old host's secret would send that secret there after a restart.
  private async saveSecretsOrRollBack(
    changes: { readonly jiraApiToken: string | undefined; readonly hrmApiKey: string | undefined },
    previousConfig: WorkdayConfig,
  ): Promise<void> {
    try {
      // The unchanged secret keeps the file's value, never an env override's.
      const saved = readFileSecrets(this.deps.dataDir)
      await saveSecrets(this.deps.dataDir, {
        jiraApiToken: changes.jiraApiToken ?? saved.jiraApiToken,
        hrmApiKey: changes.hrmApiKey ?? saved.hrmApiKey,
      })
    } catch (error: unknown) {
      try {
        await saveConfig(this.deps.dataDir, previousConfig)
      } catch (rollbackError: unknown) {
        this.logError('Rolling config.json back failed', rollbackError)
      }
      throw error
    }
  }

  private wouldSendTokenElsewhere(update: SettingsUpdate): boolean {
    const nextJira = update.jira
    if (nextJira === undefined || nextJira === null || update.jiraApiToken !== undefined) {
      return false
    }
    // An env token is the user's own choice for whatever host they configure.
    if (this.jiraToken.source !== 'file') {
      return false
    }
    const savedJira = this.config.jira
    return savedJira === null || !sameBaseUrl(savedJira.baseUrl, nextJira.baseUrl)
  }

  private wouldSendHrmKeyElsewhere(update: SettingsUpdate): boolean {
    const nextHrm = update.timesheet?.hrm
    if (nextHrm === undefined || nextHrm === null || update.hrmApiKey !== undefined) {
      return false
    }
    if (this.hrmKey.source !== 'file') {
      return false
    }
    const savedHrm = this.config.timesheet.hrm
    return savedHrm === null || !sameBaseUrl(savedHrm.mcpUrl, nextHrm.mcpUrl)
  }

  private apply(previous: AppliedState | null): void {
    const { jira, pollMinutes, timeZone } = this.config
    const token = this.jiraToken.token
    const trackerChanged =
      previous === null ||
      previous.token !== token ||
      JSON.stringify(previous.config.jira) !== JSON.stringify(jira)
    if (trackerChanged) {
      this.tracker = jira !== null && token !== null ? this.deps.createTracker(jira, token) : null
    }
    this.deps.board.configure({ jira, tracker: this.tracker, timeZone })
    if (this.tracker === null) {
      this.deps.scheduler.stop()
    } else if (previous === null || trackerChanged || previous.config.pollMinutes !== pollMinutes) {
      this.deps.scheduler.start(pollMinutes)
    }
    this.applyTimesheet(previous)
  }

  private applyTimesheet(previous: AppliedState | null): void {
    const { jira, timeZone, timesheet } = this.config
    const { hrm, tsc, logTime } = timesheet
    const hrmKey = this.hrmKey.key
    const hoursChanged =
      previous === null ||
      previous.hrmKey !== hrmKey ||
      JSON.stringify(previous.config.timesheet.hrm) !== JSON.stringify(hrm)
    if (hoursChanged) {
      this.hours = hrm !== null && hrmKey !== null ? this.deps.createHoursLog(hrm, hrmKey) : null
    }
    if (
      previous === null ||
      JSON.stringify(previous.config.timesheet.tsc) !== JSON.stringify(tsc)
    ) {
      this.sheet = tsc === null ? null : this.deps.createSheetLog(tsc)
    }
    this.deps.timesheet.configure({
      sheet: this.sheet,
      hours: this.hours,
      tracker: this.tracker,
      projectKey: jira?.projectKey ?? null,
      timeZone,
      logTime,
      offMarker: tsc?.offMarker ?? DEFAULT_OFF_MARKER,
    })
    if (previous === null) {
      this.deps.logScheduler.start(logTime, timeZone)
    } else if (
      previous.config.timesheet.logTime !== logTime ||
      previous.config.timeZone !== timeZone
    ) {
      this.deps.logScheduler.setLogTime(logTime, timeZone)
    }
  }

  private logError(message: string, error: unknown): void {
    const logError = this.deps.logError ?? console.error
    logError(message, error)
  }
}
