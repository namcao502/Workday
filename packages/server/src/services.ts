import { homedir } from 'node:os'
import { join } from 'node:path'
import type {
  AzureDevOpsConfig,
  ClaudeAgent,
  HoursLog,
  HrmConfig,
  JiraConfig,
  PullRequests,
  SheetLog,
  TicketTracker,
  RemoteConfig,
  TscConfig,
  WorkdayConfig,
} from '@workday/core'
import { AzureDevOpsClient } from './azureDevOps/adoClient.js'
import { BoardService } from './board/boardService.js'
import { PollReactions } from './board/pollReactions.js'
import { PollScheduler } from './board/pollScheduler.js'
import { loadBoard, saveBoard } from './boardStore.js'
import { DEFAULT_OFF_MARKER } from './config.js'
import { EventHub } from './events.js'
import { loadTicketUpdates, saveTicketUpdates, TicketUpdateService } from './jira/ticketUpdates.js'
import { createInsights } from './insights/createInsights.js'
import type { ReportReader } from './insights/reportReader.js'
import { claudeWaitNotice } from './notices/claudeWaitNotice.js'
import { loadNotices, saveNotices } from './notices/noticeStore.js'
import { NoticeService } from './notices/noticeService.js'
import { JobRuns, type RecordJob } from './schedules/jobRuns.js'
import { spawnScan, type SpawnScan } from './schedules/scanProcess.js'
import { ScanRunner } from './schedules/scanRunner.js'
import type { SchedulesSource } from './schedules/schedulesView.js'
import { loadScanState } from './schedules/scanStore.js'
import { PrService } from './prs/prService.js'
import { loadPrState, savePrState } from './prs/prStore.js'
import type { AccessTokenVerifier } from './remote/accessJwt.js'
import { RemoteService } from './remote/remoteService.js'
import type { SendPush } from './remote/pushService.js'
import type { SpawnTunnel } from './remote/tunnelSupervisor.js'
import { NO_STATUS_FLOW, SettingsService, type Scheduler } from './settings/settingsService.js'
import { TeamsChatClient, type TeamsGateway } from './teams/teamsChatClient.js'
import { PlaywrightTeamsSniffer } from './teams/teamsSniffer.js'
import { fileTeamsSessionStore } from './teams/teamsSessionStore.js'
import { TeamsService } from './teams/teamsService.js'
import { TeamsWatcher } from './teams/teamsWatcher.js'
import { loadPostIndex, loadTeamsState, savePostIndex, saveTeamsState } from './teams/teamsStore.js'
import { BrowserLock } from './tsc/browserLock.js'
import { SuggestionService } from './suggestions/suggestionService.js'
import { loadSuggestionState, saveSuggestionState } from './suggestions/suggestionStore.js'
import { runNotice, runPushMessage } from './timesheet/runNotification.js'
import { LogScheduler, type LogTimer } from './timesheet/logScheduler.js'
import { weekReviewNotice } from './timesheet/runNotification.js'
import { loadQueue, saveQueue } from './timesheet/queueStore.js'
import { qcBugsOf, readBugFixes } from './workspace/bugFixes.js'
import { AutoLineRunner } from './workspace/autoLineRunner.js'
import { isDirectory } from './workspace/agentSession.js'
import { BugFixer } from './workspace/fixBug.js'
import { worktreePathOf } from './workspace/ticketWorktrees.js'
import { readDayActivity } from './timesheet/dayActivity.js'
import { createDaySuggestions, type DaySuggestionsSource } from './timesheet/daySuggestions.js'
import { TimesheetService } from './timesheet/timesheetService.js'
import { defaultClaudeExecutable, sessionEnvironment } from './workspace/launchEnvironment.js'
import type { SpawnEditor } from './workspace/openInEditor.js'
import { createSdkAgent } from './workspace/sdkAgent.js'
import { WorkspaceService } from './workspace/workspaceService.js'
import { loadWorkspace, saveWorkspace } from './workspace/workspaceStore.js'
import { WorktreeCleanupService } from './workspace/worktreeCleanup.js'
import {
  createWorktree,
  type WorktreeOptions,
  type WorktreeResult,
} from './workspace/worktreeService.js'

const TMP_FOLDER = 'tmp'
const TEAMS_BROWSER_FOLDER = 'teams-browser'
const TEAMS_FIRST_CHECK_MINUTES = 1

export interface ServicesOptions {
  readonly localOrigin?: string | undefined // where this PC's browser opens the app
  readonly dataDir: string
  readonly config: WorkdayConfig
  readonly createTracker: (jira: JiraConfig, token: string) => TicketTracker
  readonly createHoursLog: (hrm: HrmConfig, apiKey: string) => HoursLog
  // Tests pass their own; by default a real Azure DevOps client.
  readonly teams?: TeamsGateway // default: the real client on the Teams browser profile
  readonly createPullRequests?: (config: AzureDevOpsConfig, pat: string) => PullRequests
  readonly createSheetLog: (tsc: TscConfig) => SheetLog
  // Tests pass their own; by default a PollScheduler drives the board's poll.
  readonly scheduler?: Scheduler
  // Tests pass their own; by default a PollScheduler drives the PR check.
  readonly prScheduler?: Scheduler
  // Tests pass their own; by default the Teams reminder check first runs after a minute.
  readonly teamsScheduler?: Scheduler
  // Tests pass their own; by default a LogScheduler fires the timesheet's daily run.
  readonly logScheduler?: LogTimer
  // Tests pass their own; by default the real Cloudflare Access verifier.
  readonly createAccessVerifier?: (remote: RemoteConfig) => AccessTokenVerifier
  // Tests pass their own; by default web-push and a real cloudflared process.
  readonly sendPush?: SendPush
  readonly spawnTunnel?: SpawnTunnel
  // Tests pass a fake agent and a temp home, so no real claude or ~/.claude is touched.
  readonly agent?: ClaudeAgent
  readonly homeDir?: string
  readonly tmpDir?: string // Teams hand-off task files go under it; default <dataDir>/tmp
  readonly spawnEditor?: SpawnEditor
  // Tests pass a fake process, so the knowledge scan never starts pwsh.
  readonly spawnScan?: SpawnScan
  // Tests pass a fake, so Start never runs git against a real repo.
  readonly createWorktree?: (options: WorktreeOptions) => Promise<WorktreeResult>
  readonly logError?: (message: string, error: unknown) => void
}

export interface Services {
  readonly board: BoardService
  readonly settings: SettingsService
  readonly timesheet: TimesheetService
  readonly daySuggestions: DaySuggestionsSource
  readonly events: EventHub
  readonly remote: RemoteService
  readonly notices: NoticeService
  readonly ticketUpdates: TicketUpdateService
  readonly workspace: WorkspaceService
  readonly cleanup: WorktreeCleanupService
  readonly prs: PrService
  readonly suggestions: SuggestionService
  readonly teams: TeamsService
  readonly teamsWatcher: TeamsWatcher
  readonly insights: ReportReader
  readonly schedules: SchedulesSource
  readonly scanRunner: ScanRunner
  readonly scheduler: Scheduler
  readonly prScheduler: Scheduler
  readonly teamsScheduler: Scheduler
  readonly logScheduler: LogTimer
}

// Loads the board and queue from the data dir; settings.start() then connects Jira, TSC, HRM and the schedules.
export function createServices(options: ServicesOptions): Services {
  const { dataDir, config } = options
  const logError = options.logError === undefined ? {} : { logError: options.logError }
  const reportError = options.logError ?? console.error
  const events = new EventHub()
  const jobRuns = new JobRuns(dataDir, reportError)
  const recordJob: RecordJob = (job, run) => {
    jobRuns.record(job, run)
  }
  const board: BoardService = new BoardService({
    initialState: loadBoard(dataDir),
    save: (state) => saveBoard(dataDir, state),
    events,
    settings: { jira: config.jira, tracker: null, timeZone: config.timeZone },
    recordJob,
    afterPoll: (tracker, jira) =>
      ticketUpdates.check(tracker, { eta: jira.etaFieldId, devPriority: jira.devPriorityFieldId }),
    onPollChanges: (changes) => pollReactions.react(changes),
    ...logError,
  })
  const remote = new RemoteService({
    dataDir,
    events,
    now: () => new Date(),
    ...(options.createAccessVerifier === undefined
      ? {}
      : { createVerifier: options.createAccessVerifier }),
    ...(options.sendPush === undefined ? {} : { sendPush: options.sendPush }),
    localOrigin: options.localOrigin,
    ...(options.spawnTunnel === undefined ? {} : { spawnTunnel: options.spawnTunnel }),
    ...logError,
  })
  const timesheet = new TimesheetService({
    loadQueue: () => loadQueue(dataDir),
    saveQueue: (queue) => saveQueue(dataDir, queue),
    events,
    board,
    qcBugParents: () =>
      new Map(qcBugsOf(board.snapshot()).map((item) => [item.bug.key, item.parentKey])),
    now: () => new Date(),
    settings: {
      sheet: null,
      hours: null,
      tracker: null,
      projectKey: config.jira?.projectKey ?? null,
      timeZone: config.timeZone,
      logTime: config.timesheet.logTime,
      offMarker: config.timesheet.tsc?.offMarker ?? DEFAULT_OFF_MARKER,
      holidays: config.holidays,
    },
    recordJob,
    onRun: (summary) => {
      const message = runPushMessage(summary, settings.language, settings.timeZone)
      // At the PC the run's own notice shows there; the phone gets it only through that notice's routing.
      if (message !== null && !notices.holdsPhone()) {
        remote.push.sendToDevices(message).catch((error: unknown) => {
          reportError('Pushing the run failed', error)
        })
      }
      // notices is made below; a run only ever ends after startup, when it exists.
      const notice = runNotice(summary)
      if (notice !== null) {
        void notices.add(notice)
      }
    },
    onWeekReview: (items) => {
      void notices.add(weekReviewNotice(items))
    },
    ...logError,
  })
  const notices: NoticeService = new NoticeService({
    initial: loadNotices(dataDir),
    save: (list) => saveNotices(dataDir, list),
    events,
    now: () => new Date(),
    push: (message) => remote.push.sendToDevices(message),
    // Edge's local push would open Edge; the app shows its own notifications.
    pushLocal: (message) =>
      events.hasLocalApp() ? Promise.resolve() : remote.push.sendToLocal(message),
    settings: () => ({
      prefs: settings.notices,
      language: settings.language,
      routing: settings.noticeRouting,
    }),
    logError: reportError,
  })
  const ticketUpdates: TicketUpdateService = new TicketUpdateService({
    initial: loadTicketUpdates(dataDir),
    save: (updates) => saveTicketUpdates(dataDir, updates),
    events,
    notices,
    board,
    logError: reportError,
  })
  const scanRunner = new ScanRunner({
    dataDir,
    initial: loadScanState(dataDir),
    now: () => new Date(),
    spawn: options.spawnScan ?? spawnScan,
    events,
    notices,
    environment: process.env,
    logError: reportError,
  })
  const homeDir = options.homeDir ?? homedir()
  const agent =
    options.agent ??
    createSdkAgent({
      executable: () =>
        settings.view().config.workspace.claudeExecutable ??
        defaultClaudeExecutable(homeDir, process.platform === 'win32'),
      env: () => sessionEnvironment(process.env),
      logError: reportError,
    })
  const workspace = new WorkspaceService({
    config: config.workspace,
    initialState: loadWorkspace(dataDir),
    save: (state) => saveWorkspace(dataDir, state),
    events,
    onWait: (session, tab, wait) => {
      if (wait === 'finished') {
        // Teams first: the PR lines wait a few seconds, so a suggested reply is not stuck behind a long fix.
        void teams.retryAnalyses()
        autoLines.runSoon()
      }
      notices.add(claudeWaitNotice(session, tab, wait)).catch((error: unknown) => {
        reportError('Adding a Claude notice failed', error)
      })
    },
    onSeen: (session) => {
      notices.markReadAt(`session:${session}`).catch((error: unknown) => {
        reportError('Reading a Claude notice failed', error)
      })
    },
    agent,
    ...(options.spawnEditor === undefined ? {} : { spawnEditor: options.spawnEditor }),
    homeDir,
    board,
    timesheet,
    createWorktree:
      options.createWorktree ??
      ((worktree) =>
        createWorktree(worktree, (message) => {
          reportError(message, null)
        })),
    ...logError,
  })
  const prs: PrService = new PrService({
    initialState: loadPrState(dataDir),
    save: (state) => savePrState(dataDir, state),
    events,
    notices,
    board,
    settings: {
      pullRequests: null,
      tracker: null,
      flow: config.jira?.statusFlow ?? NO_STATUS_FLOW,
      repoLabels: config.azureDevOps?.repoLabels ?? {},
    },
    recordJob,
    onAutoLines: (lines) => {
      void autoLines.queue(lines)
    },
    ...logError,
  })
  // Declared after workspace and prs, which only call it once the app runs.
  const autoLines: AutoLineRunner = new AutoLineRunner({
    board,
    workspace,
    hasWorktree: (key) => {
      const devRepo = settings.view().config.workspace.devRepoPath
      return devRepo !== null && isDirectory(worktreePathOf(devRepo, key))
    },
    logError: reportError,
  })
  const suggestions: SuggestionService = new SuggestionService({
    initialState: loadSuggestionState(dataDir),
    save: (state) => saveSuggestionState(dataDir, state),
    events,
    notices,
    board,
    settings: { tracker: null, config: null, projectKey: null, timeZone: config.timeZone },
    ...logError,
  })
  const teams = new TeamsService({
    initialIndex: loadPostIndex(dataDir),
    saveIndex: (index) => savePostIndex(dataDir, index),
    initialState: loadTeamsState(dataDir),
    saveState: (state) => saveTeamsState(dataDir, state),
    now: () => new Date(),
    board,
    prs,
    workspace,
    tmpDir: options.tmpDir ?? join(dataDir, TMP_FOLDER),
  })
  const teamsScheduler: Scheduler =
    options.teamsScheduler ??
    new PollScheduler(() => teamsWatcher.check(), reportError, TEAMS_FIRST_CHECK_MINUTES)
  const teamsWatcher: TeamsWatcher = new TeamsWatcher({
    lookup: teams.lookup,
    board,
    workspace,
    notices,
    events,
    scheduler: teamsScheduler,
    dbReviewChannel: () => settings.teamsConfig.dbReviewChannel,
    readBugFixes: async () => {
      const devRepo = settings.view().config.workspace.devRepoPath
      return devRepo === null
        ? []
        : readBugFixes(qcBugsOf(board.snapshot()), devRepo, new Date(), (message) => {
            reportError(message, null)
          })
    },
    recordJob,
    onNewMessages: (messages) => {
      void teams.onNewMessages(messages)
    },
    logError: reportError,
  })
  teams.onSignedIn(() => {
    teamsWatcher.resume()
  })
  // Suggestions follow a poll that read Jira; a failed poll keeps the last ones.
  const scheduler =
    options.scheduler ??
    new PollScheduler(async () => {
      await board.poll()
      if (board.view().lastPoll?.ok === true) {
        await suggestions.refresh()
      }
    })
  const prScheduler = options.prScheduler ?? new PollScheduler(() => prs.check())
  const logScheduler = options.logScheduler ?? new LogScheduler(() => timesheet.runSchedule())
  const settings: SettingsService = new SettingsService({
    dataDir,
    config,
    board,
    scheduler,
    events,
    createTracker: options.createTracker,
    timesheet,
    logScheduler,
    createHoursLog: options.createHoursLog,
    createPullRequests:
      options.createPullRequests ?? ((ado, pat) => new AzureDevOpsClient(ado, pat)),
    createSheetLog: options.createSheetLog,
    teams:
      options.teams ??
      new TeamsChatClient(
        new PlaywrightTeamsSniffer(join(dataDir, TEAMS_BROWSER_FOLDER), new BrowserLock()),
        undefined,
        undefined,
        fileTeamsSessionStore(dataDir),
      ),
    teamsService: teams,
    teamsWatcher,
    scanRunner,
    prs,
    suggestions,
    prScheduler,
    remote,
    workspace,
    ...logError,
  })
  // A new ticket starts by itself unless Settings turn it off; a QC bug goes to its parent's Claude instead.
  const bugFixer = new BugFixer({
    board,
    workspace,
    timesheet,
    devRepoPath: () => settings.view().config.workspace.devRepoPath,
    logError: reportError,
  })
  const pollReactions = new PollReactions({
    notices,
    board,
    autoStart: () => settings.view().config.workspace.autoStartTickets,
    start: (key) => workspace.start(key),
    fixBug: (key) => bugFixer.fix(key),
    logError: reportError,
  })
  const cleanup = new WorktreeCleanupService({
    config: () => settings.view().config.workspace,
    tracking: () => prs.state().tracking,
    inProgressKeys: () => new Set(Object.keys(board.snapshot().inProgress)),
    runningKeys: () => workspace.runningTicketKeys(),
    logError: (message) => {
      reportError(message, null)
    },
  })
  const insights = createInsights({
    dataDir,
    homeDir,
    config: () => settings.view().config,
    board: () => board.snapshot(),
    hrmTasks: (from, to) => timesheet.hrmTasks(from, to),
    logError: reportError,
  })
  const daySuggestions = createDaySuggestions({
    board: () => board.snapshot(),
    timesheet: () => timesheet.view(),
    config: () => settings.view().config,
    readActivity: (activityOptions) =>
      readDayActivity({ ...activityOptions, projectsRoot: join(homeDir, '.claude', 'projects') }),
  })
  const schedules: SchedulesSource = {
    runner: scanRunner,
    jobRuns,
    settings: {
      get timeZone() {
        return settings.timeZone
      },
      get knowledgeScan() {
        return settings.view().config.knowledgeScan
      },
      get logTime() {
        return settings.view().config.timesheet.logTime
      },
    },
    now: () => new Date(),
  }
  return {
    board,
    settings,
    timesheet,
    daySuggestions,
    events,
    remote,
    notices,
    ticketUpdates,
    workspace,
    cleanup,
    prs,
    suggestions,
    teams,
    teamsWatcher,
    insights,
    schedules,
    scanRunner,
    scheduler,
    prScheduler,
    teamsScheduler,
    logScheduler,
  }
}
