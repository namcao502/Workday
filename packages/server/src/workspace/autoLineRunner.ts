// What the PR check hands to Claude by itself (port of TrayApp.AutoLines): pr-comments on new PR comments, pr-refresh on
// a new conflict. A line waits until the ticket's first Claude is free, tried after every check and every ended turn.
import {
  addAutoLine,
  dropAutoLines,
  nextAutoLine,
  removeAutoLine,
  type AutoLines,
  type BoardState,
} from '@workday/core'
import type { AutoLineRequest } from '../prs/prService.js'
import type { PromptOutcome } from '../teams/teamsHandOff.js'
import { qcBugsOf } from './bugFixes.js'

export interface AutoLineRunnerDeps {
  readonly board: { snapshot(): BoardState }
  readonly workspace: {
    promptState(name: string): PromptOutcome
    isWorking(name: string): boolean // a turn is running or queued
    prompt(name: string, text: string): PromptOutcome
    openTicketTab(key: string): Promise<void>
  }
  readonly hasWorktree: (ticketKey: string) => boolean
  // After a turn ends: lets the turn's own follow-ups (a retried Teams analysis) go first.
  readonly delayMs?: number
  readonly logError: (message: string, error: unknown) => void
}

const DEFAULT_DELAY_MS = 5000

export class AutoLineRunner {
  private lines: AutoLines = {}
  private running = false
  private readonly delayMs: number

  constructor(private readonly deps: AutoLineRunnerDeps) {
    this.delayMs = deps.delayMs ?? DEFAULT_DELAY_MS
  }

  waiting(): AutoLines {
    return this.lines
  }

  // A QC bug's PRs are worked in its parent's worktree, so its lines go to the parent's Claude.
  async queue(requests: readonly AutoLineRequest[]): Promise<void> {
    const parentByBug = new Map(
      qcBugsOf(this.deps.board.snapshot()).map((found) => [found.bug.key, found.parentKey]),
    )
    for (const { ticketKey, line } of requests) {
      this.lines = addAutoLine(this.lines, parentByBug.get(ticketKey) ?? ticketKey, line)
    }
    await this.run()
  }

  // A Claude turn just ended.
  runSoon(): void {
    if (Object.keys(this.lines).length === 0) {
      return
    }
    setTimeout(() => {
      void this.run()
    }, this.delayMs)
  }

  // One line per session per run: once a line goes out that Claude is busy with it until its turn ends.
  async run(): Promise<void> {
    if (this.running) {
      return
    }
    this.running = true
    try {
      for (const session of Object.keys(this.lines)) {
        await this.sendNext(session)
      }
    } catch (error: unknown) {
      this.deps.logError('Handing PR work to Claude failed', error)
    } finally {
      this.running = false
    }
  }

  private async sendNext(session: string): Promise<void> {
    const line = nextAutoLine(this.lines, session)
    if (line === null) {
      return
    }
    if (!this.deps.hasWorktree(session)) {
      this.deps.logError(`${session} has no worktree, dropped "${line}"`, null)
      this.lines = dropAutoLines(this.lines, session)
      return
    }
    const { workspace } = this.deps
    if (workspace.promptState(session) === 'notFound') {
      await workspace.openTicketTab(session)
    }
    if (workspace.promptState(session) !== 'sent' || workspace.isWorking(session)) {
      return
    }
    if (workspace.prompt(session, line) === 'sent') {
      this.lines = removeAutoLine(this.lines, session, line)
    }
  }
}
