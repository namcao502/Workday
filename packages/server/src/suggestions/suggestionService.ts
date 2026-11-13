import {
  epicMonth,
  pickMonthEpic,
  rankSuggestions,
  suggestionNotice,
  todayIn,
  type BoardState,
  type EpicTicket,
  type Suggestion,
  type SuggestionsConfig,
  type TakeOutcome,
  type TicketTracker,
} from '@workday/core'
import type { EventSink } from '../events.js'
import type { NoticeInput } from '../notices/noticeService.js'

export interface SuggestionState {
  readonly epic: EpicTicket | null
  readonly epicMonth: string | null // "YYYY-MM" the epic was picked for
  readonly items: readonly Suggestion[] // last ranking, kept when a read fails
  readonly hiddenKeys: readonly string[]
  readonly notifiedKeys: readonly string[]
  readonly notifiedOn: string | null
  readonly baselineDone: boolean
}

export interface SuggestionSettings {
  readonly tracker: TicketTracker | null
  readonly config: SuggestionsConfig | null
  readonly projectKey: string | null
  readonly timeZone: string
}

export interface SuggestionServiceDeps {
  readonly initialState: SuggestionState
  readonly save: (state: SuggestionState) => Promise<void>
  readonly events: EventSink
  readonly notices: { add(input: NoticeInput): Promise<unknown> }
  readonly board: { snapshot(): BoardState; poll(): Promise<void> }
  readonly settings: SuggestionSettings
  readonly now?: () => Date
  readonly logError?: (message: string, error: unknown) => void
}

const EPIC_SEARCH_SIZE = 10
const CANDIDATE_SEARCH_SIZE = 100
const MINE_SEARCH_SIZE = 50
const EPIC_PLACEHOLDER = '{epic}'

function logToConsole(message: string, error: unknown): void {
  console.error(message, error)
}

// Every key on the board, dismissed included: a ticket the user already has is never suggested.
function boardKeys(board: BoardState): ReadonlySet<string> {
  return new Set([
    ...Object.keys(board.new),
    ...Object.keys(board.inProgress),
    ...Object.keys(board.done),
    ...Object.keys(board.dismissed),
  ])
}

// Port of TrayApp.TicketSuggestions: the month's epic is read after each good poll and its free tickets ranked.
export class SuggestionService {
  private current: SuggestionState
  private settings: SuggestionSettings
  private queue: Promise<void> = Promise.resolve()
  private readonly now: () => Date
  private readonly logError: (message: string, error: unknown) => void

  constructor(private readonly deps: SuggestionServiceDeps) {
    this.current = deps.initialState
    this.settings = deps.settings
    this.now = deps.now ?? (() => new Date())
    this.logError = deps.logError ?? logToConsole
  }

  configure(settings: SuggestionSettings): void {
    this.settings = settings
  }

  // Null while suggestions are not configured.
  view(): { readonly epicKey: string | null; readonly items: readonly Suggestion[] } | null {
    if (this.settings.config === null) {
      return null
    }
    return { epicKey: this.current.epic?.key ?? null, items: this.current.items }
  }

  // A failed read is logged and keeps the last items.
  async refresh(): Promise<void> {
    const { tracker, config, timeZone } = this.settings
    if (tracker === null || config === null) {
      return
    }
    const today = todayIn(timeZone, this.now())
    try {
      const epic = await this.findEpic(tracker, config, today)
      const [candidates, mine] =
        epic === null
          ? [[], []]
          : await Promise.all([
              tracker.searchEpicTickets(
                config.candidatesJql.replaceAll(EPIC_PLACEHOLDER, epic.key),
                CANDIDATE_SEARCH_SIZE,
              ),
              tracker.searchEpicTickets(
                config.mineJql.replaceAll(EPIC_PLACEHOLDER, epic.key),
                MINE_SEARCH_SIZE,
              ),
            ])
      const notice = await this.enqueue(() =>
        this.settings.tracker === tracker
          ? this.applyRead(epic, candidates, mine, config, today)
          : null,
      )
      if (notice !== null) {
        this.deps.notices.add(notice).catch((error: unknown) => {
          this.logError('Adding a suggestions notice failed', error)
        })
      }
    } catch (error: unknown) {
      this.logError('Reading the month epic failed; the suggestions are kept', error)
    }
  }

  // Either way the ticket is no one's to take any more; a Jira failure throws.
  async take(key: string): Promise<TakeOutcome> {
    const { tracker } = this.settings
    if (tracker === null) {
      throw new Error('Jira is not connected')
    }
    const holder = await tracker.assignToMe(key)
    await this.enqueue(() => this.commit(this.withoutItem(this.current, key)))
    if (holder !== null) {
      return { ok: false, holder }
    }
    this.deps.board.poll().catch((error: unknown) => {
      this.logError('Polling the board after taking a ticket failed', error)
    })
    return { ok: true }
  }

  async hide(key: string): Promise<void> {
    await this.enqueue(() => {
      const hiddenKeys = this.current.hiddenKeys.includes(key)
        ? this.current.hiddenKeys
        : [...this.current.hiddenKeys, key]
      return this.commit({ ...this.withoutItem(this.current, key), hiddenKeys })
    })
  }

  // Last month's epic holds the work early in a month, so it is looked up again until this month's exists.
  private async findEpic(
    tracker: TicketTracker,
    config: SuggestionsConfig,
    today: string,
  ): Promise<EpicTicket | null> {
    const { epic, epicMonth: pickedMonth } = this.current
    if (epic !== null && pickedMonth === today.slice(0, 7)) {
      return epic
    }
    const epics = await tracker.searchEpicTickets(config.epicJql, EPIC_SEARCH_SIZE)
    return pickMonthEpic(epics, today, config.epicTitlePrefix)
  }

  // Returns the notice to add, if any.
  private async applyRead(
    epic: EpicTicket | null,
    candidates: readonly EpicTicket[],
    mine: readonly EpicTicket[],
    config: SuggestionsConfig,
    today: string,
  ): Promise<NoticeInput | null> {
    const candidateKeys = new Set(candidates.map((ticket) => ticket.key))
    const hiddenKeys = this.current.hiddenKeys.filter((key) => candidateKeys.has(key))
    const excluded = new Set([...hiddenKeys, ...boardKeys(this.deps.board.snapshot())])
    const items = rankSuggestions(candidates, mine, excluded, today, {
      selectedStatus: config.selectedStatus,
      stopWords: this.settings.projectKey === null ? [] : [this.settings.projectKey.toLowerCase()],
    })
    const told =
      epic === null
        ? null
        : suggestionNotice(
            items,
            this.current.notifiedKeys,
            this.current.notifiedOn,
            this.current.baselineDone,
            today,
          )
    const noticeKeys = told === null ? [] : told.noticeKeys
    await this.commit({
      epic,
      epicMonth: epic === null ? null : epicMonth(epic.summary, config.epicTitlePrefix),
      items,
      hiddenKeys,
      notifiedKeys: told === null ? this.current.notifiedKeys : told.notifiedKeys,
      notifiedOn: noticeKeys.length === 0 ? this.current.notifiedOn : today,
      baselineDone: this.current.baselineDone || epic !== null,
    })
    if (noticeKeys.length === 0) {
      return null
    }
    return {
      topic: 'suggestions',
      tone: 'info',
      event: { type: 'suggestionsUrgent', keys: noticeKeys },
      target: { kind: 'board', key: null },
      place: 'board',
    }
  }

  private withoutItem(state: SuggestionState, key: string): SuggestionState {
    return { ...state, items: state.items.filter((item) => item.ticket.key !== key) }
  }

  // Runs after every earlier task; a failed task rejects its own caller but never the chain.
  private enqueue<Result>(task: () => Result | Promise<Result>): Promise<Result> {
    const run = this.queue.then(task)
    this.queue = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  // Saved before it is kept, so a failed save leaves the state as it was.
  private async commit(next: SuggestionState): Promise<void> {
    if (JSON.stringify(next) === JSON.stringify(this.current)) {
      return
    }
    await this.deps.save(next)
    this.current = next
    this.deps.events.broadcast({ type: 'work.changed' })
  }
}
