import { readFile, stat } from 'node:fs/promises'
import {
  bugBranchOf,
  listedChanges,
  MAX_DIFF_CHARS,
  parseExcerpt,
  parseNameStatus,
  type DiffView,
  type FileChange,
} from '@workday/core'
import { runGit, type GitResult } from './git.js'
import { resolveInside } from './ticketFiles.js'

const GIT_TIMEOUT_MS = 30_000

export interface ChangeSet {
  readonly baseCommit: string
  readonly tip: string // a ref, or "HEAD" when there is no ticket branch
  readonly isWorkingTree: boolean
  readonly files: readonly FileChange[]
  readonly bugKey: string | null
}

// Read-only: no index refresh or lock that could collide with Claude running git in the same worktree.
function git(root: string, ...args: string[]): Promise<GitResult> {
  return runGit(root, ['--no-optional-locks', ...args], GIT_TIMEOUT_MS)
}

// The later merge base of parent and main: a bug cut from main after the parent merged
// would otherwise list all of main's new commits.
async function parentMergeBase(root: string, tip: string, parentKey: string): Promise<GitResult> {
  const mainBase = await git(root, 'merge-base', tip, 'origin/main')
  const parentBase = await git(root, 'merge-base', tip, `origin/${parentKey}`)
  if (!mainBase.ok || !parentBase.ok) {
    return mainBase
  }
  const parentIsLater = await git(
    root,
    'merge-base',
    '--is-ancestor',
    mainBase.stdout.trim(),
    parentBase.stdout.trim(),
  )
  return parentIsLater.ok ? parentBase : mainBase
}

function splitNul(output: string): readonly string[] {
  return output.split('\0').filter((part) => part !== '')
}

// A terminal tab has no ticket: working tree against the merge base with origin/main, else HEAD.
// Null when git fails.
async function listWorkingChanges(
  root: string,
  localOnlyPaths: readonly string[],
): Promise<ChangeSet | null> {
  const hasOriginMain = (
    await git(root, 'rev-parse', '--verify', '--quiet', 'refs/remotes/origin/main')
  ).ok
  const mergeBase = hasOriginMain ? await git(root, 'merge-base', 'HEAD', 'origin/main') : null
  if (mergeBase !== null && !mergeBase.ok) {
    return null
  }
  const baseCommit = mergeBase === null ? 'HEAD' : mergeBase.stdout.trim()
  const diff = await git(root, 'diff', '--name-status', '--no-renames', '-z', baseCommit, '--')
  const untracked = diff.ok
    ? await git(root, 'ls-files', '--others', '--exclude-standard', '-z')
    : diff
  if (!untracked.ok) {
    return null
  }
  const added = splitNul(untracked.stdout).map((path): FileChange => ({ path, status: 'A' }))
  const files = listedChanges([...parseNameStatus(diff.stdout), ...added], localOnlyPaths)
  return { baseCommit, tip: 'HEAD', isWorkingTree: true, files, bugKey: null }
}

// Null when git fails (not a repo, no origin/main, ...).
export async function listChanges(
  root: string,
  ticketKey: string | null,
  localOnlyPaths: readonly string[],
): Promise<ChangeSet | null> {
  if (ticketKey === null) {
    return listWorkingChanges(root, localOnlyPaths)
  }
  const current = await git(root, 'branch', '--show-current')
  const currentBranch = current.stdout.trim()
  // A QC bug fixed in its parent's worktree: its branch, against the parent's tip (or main, for a bug cut from main).
  const bugKey = current.ok ? bugBranchOf(currentBranch, ticketKey) : null
  const shownKey = bugKey ?? ticketKey
  const ticketRef = `refs/heads/${shownKey}`
  const hasTicketBranch = (await git(root, 'rev-parse', '--verify', '--quiet', ticketRef)).ok
  const tip = hasTicketBranch ? ticketRef : 'HEAD'
  const isWorkingTree = !hasTicketBranch || currentBranch === shownKey

  // A sub-task's branch was cut from its parent's; the config is unset (exit 1) for any other ticket.
  const parentConfig =
    bugKey === null ? await git(root, 'config', '--get', `branch.${shownKey}.parentTicket`) : null
  const subTaskParent = parentConfig?.ok === true ? parentConfig.stdout.trim() : ''
  const mergeBase = !current.ok
    ? current
    : bugKey !== null
      ? await parentMergeBase(root, tip, ticketKey)
      : subTaskParent !== ''
        ? await parentMergeBase(root, tip, subTaskParent)
        : await git(root, 'merge-base', tip, 'origin/main')
  if (!mergeBase.ok) {
    return null
  }
  const baseCommit = mergeBase.stdout.trim()
  const diff = await git(
    root,
    ...['diff', '--name-status', '--no-renames', '-z', baseCommit, ...(isWorkingTree ? [] : [tip]), '--'],
  )
  const untracked =
    diff.ok && isWorkingTree
      ? await git(root, 'ls-files', '--others', '--exclude-standard', '-z')
      : diff
  if (!untracked.ok) {
    return null
  }
  const added = isWorkingTree
    ? splitNul(untracked.stdout).map((path): FileChange => ({ path, status: 'A' }))
    : []
  const files = listedChanges([...parseNameStatus(diff.stdout), ...added], localOnlyPaths)
  return { baseCommit, tip, isWorkingTree, files, bugKey }
}

function displayable(text: string): string | null {
  return text.length > MAX_DIFF_CHARS || text.includes('\0') ? null : text
}

// The size check first, so a large blob is never read whole.
async function readBlob(root: string, revision: string, path: string): Promise<string | null> {
  const size = await git(root, 'cat-file', '-s', `${revision}:${path}`)
  const bytes = Number(size.stdout.trim())
  if (!size.ok || !Number.isFinite(bytes) || bytes > MAX_DIFF_CHARS) {
    return null
  }
  const show = await git(root, 'show', `${revision}:${path}`)
  return show.ok ? displayable(show.stdout) : null
}

// Each side: '' when the file does not exist on it, null when it is not showable (binary or over the limit).
async function readOriginal(root: string, set: ChangeSet, file: FileChange): Promise<string | null> {
  return file.status === 'A' ? '' : readBlob(root, set.baseCommit, file.path)
}

// Throws PathOutsideError for a path that leaves the worktree, and I/O errors for a locked file.
async function readModified(root: string, set: ChangeSet, file: FileChange): Promise<string | null> {
  if (file.status === 'D') {
    return ''
  }
  if (!set.isWorkingTree) {
    return readBlob(root, set.tip, file.path)
  }
  const full = await resolveInside(root, file.path)
  let size: number
  try {
    size = (await stat(full)).size
  } catch {
    return ''
  }
  return size > MAX_DIFF_CHARS ? null : displayable(await readFile(full, 'utf8'))
}

// Only the changed hunks, for a file with a side over the limit. Null when git has no text diff (binary).
async function readExcerpt(
  root: string,
  set: ChangeSet,
  file: FileChange,
): Promise<DiffView | null> {
  const range = set.isWorkingTree ? [set.baseCommit] : [set.baseCommit, set.tip]
  const options = ['diff', '--no-color', '--no-ext-diff', '--unified=3']
  let diff = await git(root, ...options, ...range, '--', file.path)
  // An untracked file is not in `git diff`; --no-index exits 1 when the two sides differ.
  if (diff.ok && diff.stdout.length === 0 && set.isWorkingTree && file.status === 'A') {
    await resolveInside(root, file.path)
    diff = await git(root, ...options, '--no-index', '--', '/dev/null', file.path)
    if (diff.exitCode === 1) {
      diff = { ...diff, ok: true }
    }
  }
  const excerpt = diff.ok ? parseExcerpt(diff.stdout) : null
  return excerpt === null ? null : { kind: 'excerpt', ...excerpt }
}

function withLf(text: string): string {
  return text.replaceAll('\r\n', '\n')
}

export async function readDiff(root: string, set: ChangeSet, file: FileChange): Promise<DiffView> {
  const original = await readOriginal(root, set, file)
  const modified = await readModified(root, set, file)
  if (original !== null && modified !== null) {
    return { kind: 'full', original: withLf(original), modified: withLf(modified) }
  }
  return (await readExcerpt(root, set, file)) ?? { kind: 'binary' }
}

// The label of a group when the branch shown is a bug's, e.g. "BE - Backend-DotNet (MDP-2)".
export function bugSuffix(set: ChangeSet): string {
  return set.bugKey === null ? '' : ` (${set.bugKey})`
}
