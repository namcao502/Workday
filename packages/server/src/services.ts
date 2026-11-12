import type { JiraConfig, TicketTracker, WorkdayConfig } from '@workday/core'
import { BoardService } from './board/boardService.js'
import { PollScheduler } from './board/pollScheduler.js'
import { loadBoard, saveBoard } from './boardStore.js'
import { EventHub } from './events.js'
import { SettingsService, type Scheduler } from './settings/settingsService.js'

export interface ServicesOptions {
  readonly dataDir: string
  readonly config: WorkdayConfig
  readonly createTracker: (jira: JiraConfig, token: string) => TicketTracker
  // Tests pass their own; by default a PollScheduler drives the board's poll.
  readonly scheduler?: Scheduler
  readonly logError?: (message: string, error: unknown) => void
}

export interface Services {
  readonly board: BoardService
  readonly settings: SettingsService
  readonly events: EventHub
  readonly scheduler: Scheduler
}

// Loads the board from the data dir; settings.start() then connects Jira and starts polling.
export function createServices(options: ServicesOptions): Services {
  const { dataDir, config } = options
  const events = new EventHub()
  const board = new BoardService({
    initialState: loadBoard(dataDir),
    save: (state) => saveBoard(dataDir, state),
    events,
    settings: { jira: config.jira, tracker: null, timeZone: config.timeZone },
    ...(options.logError === undefined ? {} : { logError: options.logError }),
  })
  const scheduler = options.scheduler ?? new PollScheduler(() => board.poll())
  const settings = new SettingsService({
    dataDir,
    config,
    board,
    scheduler,
    events,
    createTracker: options.createTracker,
    ...(options.logError === undefined ? {} : { logError: options.logError }),
  })
  return { board, settings, events, scheduler }
}
