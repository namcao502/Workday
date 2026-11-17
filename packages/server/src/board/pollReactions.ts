import type { AppError, BoardState, PollChanges, Ticket } from '@workday/core'
import type { NoticeInput } from '../notices/noticeService.js'
import { qcBugsOf } from '../workspace/bugFixes.js'

type Outcome = { readonly ok: true } | { readonly ok: false; readonly error: AppError }

export interface PollReactionsDeps {
  readonly notices: { add(input: NoticeInput): Promise<unknown> }
  readonly board: { snapshot(): BoardState }
  readonly autoStart: () => boolean
  readonly start: (key: string) => Promise<Outcome>
  readonly fixBug: (key: string) => Promise<Outcome>
  readonly logError: (message: string, error: unknown) => void
}

function boardNotice(event: NoticeInput['event'], key: string): NoticeInput {
  return { topic: 'jira', tone: 'info', event, target: { kind: 'board', key }, place: 'board' }
}

// Port of the C# ticket check's reactions to a poll: a notice per change, then each new ticket starts by itself.
export class PollReactions {
  // New tickets start one after another, also across polls: git and Claude are slow.
  private starting: Promise<void> = Promise.resolve()

  constructor(private readonly deps: PollReactionsDeps) {}

  // Resolves once the notices are added; the starts run on in the background.
  async react(changes: PollChanges): Promise<void> {
    const bugs = new Map(
      qcBugsOf(this.deps.board.snapshot()).map((it) => [it.bug.key, it.parentKey]),
    )
    await this.noticeNew(changes.newTickets, bugs)
    if (changes.finished.length !== 0) {
      await this.deps.notices.add(
        boardNotice(
          { type: 'ticketsDone', keys: changes.finished.map((ticket) => ticket.key) },
          changes.finished[0]?.key ?? '',
        ),
      )
    }
    if (changes.reopened.length !== 0) {
      await this.deps.notices.add(
        boardNotice(
          { type: 'ticketsReopened', keys: changes.reopened.map((ticket) => ticket.key) },
          changes.reopened[0]?.key ?? '',
        ),
      )
    }
    if (changes.newTickets.length !== 0 && this.deps.autoStart()) {
      const keys = changes.newTickets.map((ticket) => ticket.key)
      this.starting = this.starting.then(() => this.startAll(keys, bugs))
    }
  }

  // A QC bug has its own notice; the plain new tickets share one.
  private async noticeNew(
    newTickets: readonly Ticket[],
    bugs: ReadonlyMap<string, string>,
  ): Promise<void> {
    const plain = newTickets.filter((ticket) => !bugs.has(ticket.key))
    if (plain.length !== 0) {
      await this.deps.notices.add(
        boardNotice(
          { type: 'newTickets', keys: plain.map((ticket) => ticket.key) },
          plain[0]?.key ?? '',
        ),
      )
    }
    for (const ticket of newTickets) {
      const parentKey = bugs.get(ticket.key)
      if (parentKey !== undefined) {
        await this.deps.notices.add(
          boardNotice(
            { type: 'qcBugLogged', key: ticket.key, parentKey, summary: ticket.summary },
            parentKey,
          ),
        )
      }
    }
  }

  private async startAll(
    keys: readonly string[],
    bugs: ReadonlyMap<string, string>,
  ): Promise<void> {
    for (const key of keys) {
      try {
        const outcome = await (bugs.has(key) ? this.deps.fixBug(key) : this.deps.start(key))
        if (!outcome.ok) {
          await this.failed(key, outcome.error.code)
        }
      } catch (error: unknown) {
        this.deps.logError(`Starting ${key} by itself failed`, error)
        await this.failed(key, 'unknown')
      }
    }
  }

  // Never rejects: the chain of starts must go on after a notice that could not be saved.
  private async failed(key: string, code: string): Promise<void> {
    try {
      await this.deps.notices.add({
        topic: 'other',
        tone: 'error',
        event: { type: 'autoStartFailed', key, code },
        target: { kind: 'board', key },
        place: 'board',
      })
    } catch (error: unknown) {
      this.deps.logError(`Adding the failed-start notice of ${key} failed`, error)
    }
  }
}
