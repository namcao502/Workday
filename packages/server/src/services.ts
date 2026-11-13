import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import type {
  AzureDevOpsConfig,
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
import { PollScheduler } from './board/pollScheduler.js'
import { loadBoard, saveBoard } from './boardStore.js'
import { DEFAULT_OFF_MARKER } from './config.js'
import { EventHub } from './events.js'
import { claudeWaitNotice } from './notices/claudeWaitNotice.js'
import { loadNotices, saveNotices } from './notices/noticeStore.js'
import { NoticeService } from './notices/noticeService.js'
import { PrService } from './prs/prService.js'
import { loadPrState, savePrState } from './prs/prStore.js'
import type { AccessTokenVerifier } from './remote/accessJwt.js'
import { RemoteService } from './remote/remoteService.js'
import type { SendPush } from './remote/pushService.js'
import type { SpawnTunnel } from './remote/tunnelSupervisor.js'
import { NO_STATUS_FLOW, SettingsService, type Scheduler } from './settings/settingsService.js'
import { TeamsChatClient, type TeamsGateway } from './teams/teamsChatClient.js'
import { PlaywrightTeamsSniffer } from './teams/teamsSniffer.js'
import { TeamsService } from './teams/teamsService.js'
import { TeamsWatcher } from './teams/teamsWatcher.js'
import { loadPostIndex, loadTeamsState, savePostIndex, saveTeamsState } from './teams/teamsStore.js'
import { BrowserLock } from './tsc/browserLock.js'
import { SuggestionService } from './suggestions/suggestionService.js'
import { loadSuggestionState, saveSuggestionState } from './suggestions/suggestionStore.js'
import { runPushMessage } from './timesheet/runNotification.js'
import { LogScheduler, type LogTimer } from './timesheet/logScheduler.js'
import { loadQueue, saveQueue } from './timesheet/queueStore.js'
import { TimesheetService } from './timesheet/timesheetService.js'
import { spawnNodePty } from './workspace/nodePty.js'
import type { SpawnEditor } from './workspace/openInEditor.js'
import type { SpawnPty } from './workspace/pty.js'
import { WorkspaceService } from './workspace/workspaceService.js'
import { loadWorkspace, saveWorkspace } from './workspace/workspaceStore.js'
import {
  createWorktree,
  type WorktreeOptions,
  type WorktreeResult,
} from './workspace/worktreeService.js'

const TEAMS_BROWSER_FOLDER = 'teams-browser'
const TEAMS_FIRST_CHECK_MINUTES = 1

export interface ServicesOptions {
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
  // Tests pass a fake PTY and a temp home, so no real shell or ~/.claude is touched.
  readonly spawnPty?: SpawnPty
  readonly homeDir?: string
  readonly tmpDir?: string // Teams hand-off task files go under it
  readonly spawnEditor?: SpawnEditor
  // Tests pass a fake, so Start never runs git against a real repo.
  readonly createWorktree?: (options: WorktreeOptions) => Promise<WorktreeResult>
  readonly logError?: (message: string, error: unknown) => void
}

export interface Services {
  readonly board: BoardService
  readonly settings: SettingsService
  readonly timesheet: TimesheetService
  readonly events: EventHub
  readonly remote: RemoteService
  readonly notices: NoticeService
  readonly workspace: WorkspaceService
  readonly prs: PrService
  readonly suggestions: SuggestionService
  readonly teams: TeamsService
  readonly teamsWatcher: TeamsWatcher
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
  const board = new BoardService({
    initialState: loadBoard(dataDir),
    save: (state) => saveBoard(dataDir, state),
    events,
    settings: { jira: config.jira, tracker: null, timeZone: config.timeZone },
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
    ...(options.spawnTunnel === undefined ? {} : { spawnTunnel: options.spawnTunnel }),
    ...logError,
  })
  const timesheet = new TimesheetService({
    loadQueue: () => loadQueue(dataDir),
    saveQueue: (queue) => saveQueue(dataDir, queue),
    events,
    board,
    now: () => new Date(),
    settings: {
      sheet: null,
      hours: null,
      tracker: null,
      projectKey: config.jira?.projectKey ?? null,
      timeZone: config.timeZone,
      logTime: config.timesheet.logTime,
      offMarker: config.timesheet.tsc?.offMarker ?? DEFAULT_OFF_MARKER,
    },
    onRun: (summary) => {
      const message = runPushMessage(summary, settings.language, settings.timeZone)
      if (message !== null) {
        remote.push.sendToArea('timesheet', message).catch((error: unknown) => {
          reportError('Pushing the run failed', error)
        })
      }
    },
    ...logError,
  })
  const notices: NoticeService = new NoticeService({
    initial: loadNotices(dataDir),
    save: (list) => saveNotices(dataDir, list),
    events,
    now: () => new Date(),
    push: (area, message) => remote.push.sendToArea(area, message),
    settings: () => ({ prefs: settings.notices, language: settings.language }),
    logError: reportError,
  })
  const workspace = new WorkspaceService({
    dataDir,
    config: config.workspace,
    initialState: loadWorkspace(dataDir),
    save: (state) => saveWorkspace(dataDir, state),
    events,
    onWait: (session, tab, wait) => {
      notices.add(claudeWaitNotice(session, tab, wait)).catch((error: unknown) => {
        reportError('Adding a Claude notice failed', error)
      })
    },
    onSeen: (session) => {
      notices.markReadAt(`session:${session}`).catch((error: unknown) => {
        reportError('Reading a Claude notice failed', error)
      })
    },
    spawn: options.spawnPty ?? spawnNodePty,
    ...(options.spawnEditor === undefined ? {} : { spawnEditor: options.spawnEditor }),
    homeDir: options.homeDir ?? homedir(),
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
    ...logError,
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
    tmpDir: options.tmpDir ?? tmpdir(),
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
      ),
    teamsService: teams,
    teamsWatcher,
    prs,
    suggestions,
    prScheduler,
    remote,
    workspace,
    ...logError,
  })
  return {
    board,
    settings,
    timesheet,
    events,
    remote,
    notices,
    workspace,
    prs,
    suggestions,
    teams,
    teamsWatcher,
    scheduler,
    prScheduler,
    teamsScheduler,
    logScheduler,
  }
}
