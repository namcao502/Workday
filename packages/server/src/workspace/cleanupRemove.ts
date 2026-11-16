import { cpSync, lstatSync, mkdirSync, rmSync, statSync, unlinkSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { isCleanupKey, type CleanupError } from '@workday/core'
import { GIT_TIMEOUT_MS, gitText, isRegistered, repoOf, type LogLine } from './cleanupGit.js'
import { entriesOf, listFiles } from './slimTargets.js'
import { runGit } from './git.js'
import { worktreePathOf, type TicketWorktree } from './ticketWorktrees.js'

const REMOVE_TIMEOUT_MS = 10 * 60_000

// One-way worktree -> main like the sync-worktree-docs hook: copies what is missing or newer, never deletes.
function syncTicketDocs(worktreeDocs: string, mainDocs: string): void {
  for (const folder of entriesOf(worktreeDocs)) {
    if (!folder.isDirectory() || !isCleanupKey(folder.name)) {
      continue
    }
    for (const file of listFiles(join(worktreeDocs, folder.name), new Set())) {
      const target = join(mainDocs, relative(worktreeDocs, file))
      if (!isOlderOrMissing(target, file)) {
        continue
      }
      mkdirSync(dirname(target), { recursive: true })
      cpSync(file, target, { force: true })
    }
  }
}

function isOlderOrMissing(target: string, source: string): boolean {
  try {
    return statSync(source).mtimeMs > statSync(target).mtimeMs
  } catch {
    return true
  }
}

// git may follow a node_modules junction and delete the real folder, so the link goes first.
function unlinkNodeModules(worktreePath: string): void {
  const path = join(worktreePath, 'node_modules')
  try {
    if (lstatSync(path).isSymbolicLink()) {
      unlinkSync(path)
    }
  } catch (error: unknown) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
      throw error
    }
  }
}

// Null once the worktree is gone; the error otherwise.
async function removeWorktree(
  worktree: TicketWorktree,
  ticketKey: string,
  logError: LogLine,
): Promise<CleanupError | null> {
  const repoPath = repoOf(worktree.path)
  const unreadable: CleanupError = { code: 'worktreeUnreadable', repository: worktree.repository }
  const registered = await isRegistered(worktree, logError)
  if (registered === null) {
    return unreadable
  }
  unlinkNodeModules(worktree.path)
  let folderDropped = !registered
  if (registered) {
    const removal = await runGit(
      repoPath,
      ['worktree', 'remove', '--force', worktree.path],
      REMOVE_TIMEOUT_MS,
    )
    if (!removal.ok) {
      // A removal cut short by a locked bin/obj file drops the admin entry; git can no longer remove the rest.
      const after = await isRegistered(worktree, logError)
      if (after === null) {
        return unreadable
      }
      if (after) {
        logError(`[cleanup] git worktree remove ${worktree.path}: ${removal.stderr.trim()}`)
        return { code: 'worktreeFailed', repository: worktree.repository }
      }
      folderDropped = true
    }
  }
  if (folderDropped) {
    await gitText(repoPath, ['worktree', 'prune'], logError)
    rmSync(worktree.path, { recursive: true, force: true })
  }
  for (const branch of [ticketKey, `${ticketKey}-dev`]) {
    // Unmerged, missing or checked out elsewhere: kept on purpose, not an error.
    await runGit(repoPath, ['branch', '-d', branch], GIT_TIMEOUT_MS)
  }
  return null
}

// The backend (dev repo) worktree goes last: while it exists the row stays, so a failed frontend removal can be retried.
export async function removeWorktrees(
  devRepoPath: string,
  ticketKey: string,
  worktrees: readonly TicketWorktree[],
  logError: LogLine,
): Promise<CleanupError | null> {
  if (!isCleanupKey(ticketKey)) {
    return { code: 'invalidKey' }
  }
  const backendPath = worktreePathOf(devRepoPath, ticketKey)
  const ordered = [
    ...worktrees.filter((worktree) => worktree.path !== backendPath),
    ...worktrees.filter((worktree) => worktree.path === backendPath),
  ]
  try {
    if (ordered.some((worktree) => worktree.path === backendPath)) {
      syncTicketDocs(join(backendPath, 'docs'), join(devRepoPath, 'docs'))
    }
    for (const worktree of ordered) {
      const error = await removeWorktree(worktree, ticketKey, logError)
      if (error !== null) {
        return error
      }
    }
    return null
  } catch (error: unknown) {
    logError(`[cleanup] removing ${ticketKey} failed: ${String(error)}`)
    return { code: 'ioFailed' }
  }
}
