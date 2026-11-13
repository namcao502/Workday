import { homedir } from 'node:os'
import type {
  HoursLog,
  HrmConfig,
  JiraConfig,
  SheetLog,
  TicketTracker,
  RemoteConfig,
  TscConfig,
  WorkdayConfig,
} from '@workday/core'
import { BoardService } from './board/boardService.js'
import { PollScheduler } from './board/pollScheduler.js'
import { loadBoard, saveBoard } from './boardStore.js'
import { DEFAULT_OFF_MARKER } from './config.js'
import { EventHub } from './events.js'
import type { AccessTokenVerifier } from './remote/accessJwt.js'
import { RemoteService } from './remote/remoteService.js'
import type { SendPush } from './remote/pushService.js'
import type { SpawnTunnel } from './remote/tunnelSupervisor.js'
import { SettingsService, type Scheduler } from './settings/settingsService.js'
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

export interface ServicesOptions {
  readonly dataDir: string
  readonly config: WorkdayConfig
  readonly createTracker: (jira: JiraConfig, token: string) => TicketTracker
  readonly createHoursLog: (hrm: HrmConfig, apiKey: string) => HoursLog
  readonly createSheetLog: (tsc: TscConfig) => SheetLog
  // Tests pass their own; by default a PollScheduler drives the board's poll.
  readonly scheduler?: Scheduler
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
  readonly workspace: WorkspaceService
  readonly scheduler: Scheduler
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
  const workspace = new WorkspaceService({
    dataDir,
    config: config.workspace,
    initialState: loadWorkspace(dataDir),
    save: (state) => saveWorkspace(dataDir, state),
    events,
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
  const scheduler = options.scheduler ?? new PollScheduler(() => board.poll())
  const logScheduler = options.logScheduler ?? new LogScheduler(() => timesheet.runSchedule())
  const settings = new SettingsService({
    dataDir,
    config,
    board,
    scheduler,
    events,
    createTracker: options.createTracker,
    timesheet,
    logScheduler,
    createHoursLog: options.createHoursLog,
    createSheetLog: options.createSheetLog,
    remote,
    workspace,
    ...logError,
  })
  return { board, settings, timesheet, events, remote, workspace, scheduler, logScheduler }
}
