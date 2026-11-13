import {
  isTicketKey,
  type AppError,
  type OpenOutcome,
  type StartOutcome,
  type WorkspaceConfig,
} from '@workday/core'
import { isDirectory } from './sessionHost.js'
import { worktreePathOf } from './ticketWorktrees.js'
import type { WorktreeOptions, WorktreeResult } from './worktreeService.js'

export interface TicketLauncherDeps {
  readonly config: () => WorkspaceConfig
  readonly board: {
    readonly parentKeyOf: (key: string) => string | null
    readonly start: (key: string) => Promise<void>
  }
  readonly timesheet: { readonly queueToday: (keys: readonly string[]) => Promise<unknown> }
  readonly createWorktree: (options: WorktreeOptions) => Promise<WorktreeResult>
  readonly openTab: (key: string) => Promise<void>
  readonly changed: () => void
}

const OK: StartOutcome = { ok: true, warning: null }

function refusal(code: 'invalidKey' | 'workspaceNotConfigured'): StartOutcome {
  return { ok: false, error: { code } }
}

function outcomeOf(result: WorktreeResult): StartOutcome {
  if (result === 'created') {
    return OK
  }
  const code = result === 'failed' ? 'worktreeFailed' : result
  const error: AppError = { code }
  return result === 'mainNotMerged' ? { ok: true, warning: error } : { ok: false, error }
}

// Start / Open of a ticket tab. Git runs outside the workspace's serial chain, so a slow fetch blocks nothing else.
export class TicketLauncher {
  private readonly starting = new Set<string>()
  // Keys whose first claude session still has to get the start prompt; in memory only.
  private readonly shipPending = new Set<string>()

  constructor(private readonly deps: TicketLauncherDeps) {}

  startingKeys(): readonly string[] {
    return [...this.starting]
  }

  // Null once the session had its first hook, or when the worktree was not created by Start.
  pendingPrompt(key: string): string | null {
    const prompt = this.deps.config().startPrompt
    return this.shipPending.has(key) && prompt !== null ? prompt.replaceAll('{key}', key) : null
  }

  shipDone(key: string): void {
    this.shipPending.delete(key)
  }

  async start(key: string): Promise<StartOutcome> {
    const devRepo = this.devRepo(key)
    if (typeof devRepo !== 'string') {
      return devRepo
    }
    if (this.starting.has(key)) {
      return OK
    }
    // Marked before any await: a second Start for the key must see it.
    this.begin(key)
    let outcome: StartOutcome
    try {
      const path = worktreePathOf(devRepo, key)
      if (isDirectory(path)) {
        outcome = OK
      } else {
        const result = await this.create(devRepo, key)
        if (result === 'created') {
          this.shipPending.add(key)
        }
        outcome = outcomeOf(result)
      }
      await this.deps.board.start(key)
      await this.deps.timesheet.queueToday([key])
      if (outcome.ok) {
        await this.deps.openTab(key)
      }
    } finally {
      this.end(key)
    }
    return outcome
  }

  async open(key: string, recreate: boolean): Promise<OpenOutcome> {
    const devRepo = this.devRepo(key)
    if (typeof devRepo !== 'string') {
      return devRepo
    }
    if (this.starting.has(key)) {
      return OK
    }
    if (isDirectory(worktreePathOf(devRepo, key))) {
      await this.deps.openTab(key)
      return OK
    }
    if (!recreate) {
      return { ok: false, confirmRecreate: true }
    }
    this.begin(key)
    try {
      const outcome = outcomeOf(await this.create(devRepo, key))
      if (outcome.ok) {
        await this.deps.openTab(key)
      }
      return outcome
    } finally {
      this.end(key)
    }
  }

  // The dev repo, or the refusal to return.
  private devRepo(key: string): string | StartOutcome {
    if (!isTicketKey(key)) {
      return refusal('invalidKey')
    }
    const { devRepoPath } = this.deps.config()
    return devRepoPath === null || !isDirectory(devRepoPath)
      ? refusal('workspaceNotConfigured')
      : devRepoPath
  }

  private create(devRepo: string, key: string): Promise<WorktreeResult> {
    return this.deps.createWorktree({
      ticketKey: key,
      repoPath: devRepo,
      worktreePath: worktreePathOf(devRepo, key),
      parentKey: this.deps.board.parentKeyOf(key),
    })
  }

  private begin(key: string): void {
    this.starting.add(key)
    this.deps.changed()
  }

  private end(key: string): void {
    this.starting.delete(key)
    this.deps.changed()
  }
}
