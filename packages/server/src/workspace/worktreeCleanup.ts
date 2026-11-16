import { readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import {
  classifyWorktree,
  isCleanupKey,
  minedTickets,
  type CleanupOutcome,
  type CleanupRow,
  type PrTracking,
  type WorktreeFacts,
  type WorkspaceConfig,
} from '@workday/core'
import { mergedKeys, siblingRepos, type LogLine } from './cleanupGit.js'
import { SCAN_FILE_PREFIX, inspectTicket } from './cleanupInspect.js'
import { removeWorktrees } from './cleanupRemove.js'
import { entriesOf, slimBytes, slimTargets } from './slimTargets.js'
import { findWorktrees, worktreePathOf, type TicketWorktree } from './ticketWorktrees.js'

const ROW_READ_PARALLELISM = 6

export interface CleanupDeps {
  readonly config: () => WorkspaceConfig
  readonly tracking: () => PrTracking
  readonly inProgressKeys: () => ReadonlySet<string> // tickets In progress on the board
  readonly runningKeys: () => ReadonlySet<string> // tickets with a running Claude session
  readonly logError: LogLine
}

interface Repo {
  readonly devRepoPath: string
  readonly siblingRepoGlob: string | null
}

function readOrEmpty(path: string): string {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return ''
  }
}

// An unreadable file leaves every ticket unmined, so a mined flag is only ever missing, never wrong.
function minedKeys(devRepoPath: string): ReadonlySet<string> {
  const folder = join(devRepoPath, 'docs', 'local-config')
  return minedTickets(
    readOrEmpty(join(folder, `${SCAN_FILE_PREFIX}log`)),
    readOrEmpty(join(folder, `${SCAN_FILE_PREFIX}retry`)),
  )
}

// Keys with a worktree in the dev repo or a sibling repo, or a docs/<KEY> folder in the dev repo.
async function listKeys(repo: Repo): Promise<readonly string[]> {
  const repos = [repo.devRepoPath, ...(await siblingRepos(repo.devRepoPath, repo.siblingRepoGlob))]
  const folders = [
    ...repos.map((path) => join(path, '.claude', 'worktrees')),
    join(repo.devRepoPath, 'docs'),
  ]
  const names = folders.flatMap((folder) =>
    entriesOf(folder)
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name),
  )
  return [...new Set(names.filter(isCleanupKey))].sort()
}

async function mapLimit<Item, Result>(
  items: readonly Item[],
  limit: number,
  work: (item: Item) => Promise<Result>,
): Promise<Result[]> {
  const results: Result[] = new Array<Result>(items.length)
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next
      next += 1
      results[index] = await work(items[index] as Item)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

// The cleanup dialog's git and disk work: each ticket's worktrees and docs read into a row, plus Remove and Slim docs.
export class WorktreeCleanupService {
  private queue: Promise<unknown> = Promise.resolve()

  constructor(private readonly deps: CleanupDeps) {}

  // Null until the dev repo is set.
  private repo(): Repo | null {
    const { devRepoPath, siblingRepoGlob } = this.deps.config()
    if (devRepoPath === null) {
      return null
    }
    return { devRepoPath: devRepoPath.replace(/[\\/]+$/, ''), siblingRepoGlob }
  }

  async rows(): Promise<readonly CleanupRow[]> {
    const repo = this.repo()
    if (repo === null) {
      return []
    }
    const [merged, keys] = await Promise.all([
      mergedKeys(repo.devRepoPath, repo.siblingRepoGlob),
      listKeys(repo),
    ])
    const mined = minedKeys(repo.devRepoPath)
    return mapLimit(keys, ROW_READ_PARALLELISM, (key) => this.row(repo, key, mined, merged))
  }

  remove(ticketKey: string, dirtyFilesShown: number): Promise<CleanupOutcome> {
    return this.enqueue(() => this.removeChecked(ticketKey, dirtyFilesShown))
  }

  slim(ticketKey: string): Promise<CleanupOutcome> {
    return this.enqueue(() => this.slimDocs(ticketKey))
  }

  private worktreesOf(repo: Repo, ticketKey: string): Promise<readonly TicketWorktree[]> {
    return findWorktrees(repo.devRepoPath, repo.siblingRepoGlob, ticketKey)
  }

  private facts(
    repo: Repo,
    ticketKey: string,
    worktrees: readonly TicketWorktree[],
  ): Promise<WorktreeFacts> {
    const { logError } = this.deps
    return inspectTicket({
      devRepoPath: repo.devRepoPath,
      ticketKey,
      worktrees,
      localOnlyPaths: new Set(this.deps.config().localOnlyPaths.map((path) => path.toLowerCase())),
      tracking: this.deps.tracking(),
      inProgress: this.deps.inProgressKeys().has(ticketKey),
      sessionRunning: this.deps.runningKeys().has(ticketKey),
      logError,
    })
  }

  private async row(
    repo: Repo,
    ticketKey: string,
    mined: ReadonlySet<string>,
    merged: ReadonlySet<string>,
  ): Promise<CleanupRow> {
    const worktrees = await this.worktreesOf(repo, ticketKey)
    const isMerged =
      merged.has(ticketKey) ||
      Object.entries(this.deps.tracking()).some(
        ([key, pr]) => key.startsWith(`${ticketKey}|`) && pr.status === 'completed',
      )
    const base = {
      ticketKey,
      repositories: worktrees.map((worktree) => worktree.repository),
      slimBytes: slimBytes(join(repo.devRepoPath, 'docs', ticketKey)),
      isMined: mined.has(ticketKey),
      isMerged,
    }
    if (worktrees.length === 0) {
      return { ...base, verdict: 'noWorktree', reasons: [], dirtyFiles: 0 }
    }
    const facts = await this.facts(repo, ticketKey, worktrees)
    return { ...base, ...classifyWorktree(facts), dirtyFiles: facts.dirtyFiles }
  }

  // Re-reads the state the dialog showed; a different dirty count means the user confirmed something else.
  private async removeChecked(ticketKey: string, dirtyFilesShown: number): Promise<CleanupOutcome> {
    // The key ends up in folder paths that get deleted, so nothing but a real ticket key gets that far.
    if (!isCleanupKey(ticketKey)) {
      return { ok: false, error: { code: 'invalidKey' } }
    }
    const repo = this.repo()
    if (repo === null) {
      return { ok: false, error: { code: 'workspaceNotConfigured' } }
    }
    const worktrees = await this.worktreesOf(repo, ticketKey)
    const facts = await this.facts(repo, ticketKey, worktrees)
    const { verdict, reasons } = classifyWorktree(facts)
    if (verdict === 'keep') {
      return { ok: false, error: { code: 'kept', reasons } }
    }
    if (facts.dirtyFiles !== dirtyFilesShown) {
      return { ok: false, error: { code: 'stateChanged' } }
    }
    const error = await removeWorktrees(repo.devRepoPath, ticketKey, worktrees, this.deps.logError)
    return error === null ? { ok: true } : { ok: false, error }
  }

  // Deletes the slim targets of docs/<KEY> in the main checkout and in every worktree folder (a hook copies docs into each).
  private async slimDocs(ticketKey: string): Promise<CleanupOutcome> {
    if (!isCleanupKey(ticketKey)) {
      return { ok: false, error: { code: 'invalidKey' } }
    }
    const repo = this.repo()
    if (repo === null) {
      return { ok: false, error: { code: 'workspaceNotConfigured' } }
    }
    if ((await this.worktreesOf(repo, ticketKey)).length !== 0) {
      return { ok: false, error: { code: 'hasWorktree' } }
    }
    const worktreesRoot = join(repo.devRepoPath, '.claude', 'worktrees')
    const docsPaths = [
      join(repo.devRepoPath, 'docs', ticketKey),
      ...entriesOf(worktreesRoot)
        .filter((entry) => entry.isDirectory())
        .map((entry) => join(worktreePathOf(repo.devRepoPath, entry.name), 'docs', ticketKey)),
    ]
    try {
      for (const target of docsPaths.flatMap((path) => slimTargets(path))) {
        rmSync(target, { recursive: true, force: true })
      }
      return { ok: true }
    } catch (error: unknown) {
      this.deps.logError(`[cleanup] slimming the docs of ${ticketKey} failed: ${String(error)}`)
      return { ok: false, error: { code: 'ioFailed' } }
    }
  }

  private enqueue<Result>(work: () => Promise<Result>): Promise<Result> {
    const run = this.queue.then(work)
    this.queue = run.catch(() => undefined)
    return run
  }
}
