import type {
  JiraCheckRequest,
  JiraCheckResult,
  JiraConfig,
  SettingsUpdate,
  SettingsView,
  TicketTracker,
  WorkdayConfig,
} from '@workday/core'
import type { BoardService } from '../board/boardService.js'
import { loadJiraToken, saveConfig, saveSecrets, type JiraToken } from '../config.js'
import type { EventSink } from '../events.js'
import { sameBaseUrl } from './parseSettings.js'

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
  readonly logError?: (message: string, error: unknown) => void
}

// tokenRequired: the update names a Jira host the saved token was not given for, and carries no token.
export type UpdateOutcome =
  | { readonly ok: true; readonly view: SettingsView }
  | { readonly ok: false; readonly reason: 'tokenRequired' }

const CHECK_ONLY_JIRA: Omit<JiraConfig, 'baseUrl' | 'email'> = {
  projectKey: '',
  assignedJql: '',
  maxResults: 1,
  etaFieldId: null,
  devPriorityFieldId: null,
  statusFlow: { preWorkStatuses: [], reworkStatuses: [] },
}

export class SettingsService {
  private config: WorkdayConfig
  private jiraToken: JiraToken
  private tracker: TicketTracker | null = null
  private updates: Promise<unknown> = Promise.resolve()

  constructor(private readonly deps: SettingsServiceDeps) {
    this.config = deps.config
    this.jiraToken = loadJiraToken(deps.dataDir)
  }

  // Builds the tracker and starts polling from the loaded config; called once at startup.
  start(): void {
    this.apply(null)
  }

  view(): SettingsView {
    const { port, timeZone, pollMinutes, theme, language, jira } = this.config
    return {
      config: { port, timeZone, pollMinutes, theme, language, jira },
      jiraTokenSource: this.jiraToken.source,
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

  private async runUpdate(update: SettingsUpdate): Promise<UpdateOutcome> {
    if (this.wouldSendTokenElsewhere(update)) {
      return { ok: false, reason: 'tokenRequired' }
    }
    const previous = { config: this.config, token: this.jiraToken.token }
    const { jiraApiToken, ...configFields } = update
    const nextConfig = { ...this.config, ...configFields }
    // Both files are written before memory changes, so a failed write leaves the running settings as they were.
    await saveConfig(this.deps.dataDir, nextConfig)
    if (jiraApiToken !== undefined) {
      await this.saveTokenOrRollBack(jiraApiToken, previous.config)
    }
    this.jiraToken = loadJiraToken(this.deps.dataDir)
    this.config = nextConfig
    this.apply(previous)
    this.deps.events.broadcast({ type: 'settings.changed' })
    return { ok: true, view: this.view() }
  }

  // A config naming the new host beside the old host's token would send that token there after a restart.
  private async saveTokenOrRollBack(token: string, previousConfig: WorkdayConfig): Promise<void> {
    try {
      await saveSecrets(this.deps.dataDir, { jiraApiToken: token })
    } catch (error: unknown) {
      try {
        await saveConfig(this.deps.dataDir, previousConfig)
      } catch (rollbackError: unknown) {
        const logError = this.deps.logError ?? console.error
        logError('Rolling config.json back failed', rollbackError)
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

  private apply(previous: { config: WorkdayConfig; token: string | null } | null): void {
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
  }
}
