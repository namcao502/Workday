// The Fix action of a QC bug (port of TrayApp.FixQcBugAsync): hand the bug to the parent ticket's Claude session.
import type { AppError, BoardState } from '@workday/core'
import type { PromptOutcome } from '../teams/teamsHandOff.js'
import { isDirectory } from './agentSession.js'
import { qcBugsOf } from './bugFixes.js'
import { worktreePathOf } from './ticketWorktrees.js'

export interface FixBugDeps {
  readonly board: { snapshot(): BoardState; start(key: string): Promise<void> }
  readonly workspace: {
    openTicketTab(key: string): Promise<void>
    prompt(session: string, text: string): PromptOutcome
  }
  readonly timesheet: { queueToday(keys: readonly string[]): Promise<unknown> }
  readonly devRepoPath: () => string | null
  readonly logError: (message: string, error: unknown) => void
}

export type FixBugOutcome = { readonly ok: true } | { readonly ok: false; readonly error: AppError }

const PROMPT_ERRORS = {
  notFound: 'sessionNotFound',
  notRunning: 'claudeNotRunning',
  waiting: 'claudeWaiting',
} as const

function refused(error: AppError): FixBugOutcome {
  return { ok: false, error }
}

export class BugFixer {
  private readonly running = new Set<string>()

  constructor(private readonly deps: FixBugDeps) {}

  // The parent's tab first, then the line; only a line that went out moves the bug and queues the parent.
  async fix(bugKey: string): Promise<FixBugOutcome> {
    const { board, workspace, timesheet } = this.deps
    const found = qcBugsOf(board.snapshot()).find((item) => item.bug.key === bugKey)
    if (found === undefined) {
      return refused({ code: 'notABug' })
    }
    if (this.running.has(bugKey)) {
      return refused({ code: 'busy' })
    }
    this.running.add(bugKey)
    try {
      const { parentKey } = found
      await workspace.openTicketTab(parentKey)
      const devRepo = this.deps.devRepoPath()
      if (devRepo === null || !isDirectory(worktreePathOf(devRepo, parentKey))) {
        return refused({ code: 'parentWorktreeMissing', parentKey })
      }
      const sent = this.send(parentKey, bugKey)
      if (sent !== null) {
        return refused(sent)
      }
      if (Object.hasOwn(board.snapshot().new, bugKey)) {
        await board.start(bugKey)
      }
      // The lead's rule: a bug's time is logged on its parent, never on the bug.
      await timesheet.queueToday([parentKey])
      return { ok: true }
    } finally {
      this.running.delete(bugKey)
    }
  }

  // Null when the line went out.
  private send(parentKey: string, bugKey: string): AppError | null {
    try {
      const outcome = this.deps.workspace.prompt(parentKey, `jira-fetch-bug ${bugKey}`)
      return outcome === 'sent' ? null : { code: PROMPT_ERRORS[outcome] }
    } catch (error: unknown) {
      this.deps.logError(`Handing ${bugKey} to ${parentKey} failed`, error)
      return { code: 'claudeNotRunning' }
    }
  }
}
