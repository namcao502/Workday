import { appendFile, mkdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { runGit } from './git.js'

export type WorktreeResult = 'created' | 'failed' | 'parentBranchMissing' | 'mainNotMerged'

export interface WorktreeOptions {
  readonly ticketKey: string
  readonly repoPath: string
  readonly worktreePath: string
  readonly parentKey: string | null
}

export type LogGitError = (message: string) => void

const GIT_TIMEOUT_MS = 2 * 60_000
const IGNORED_FOLDERS: ReadonlySet<string> = new Set(['/.claude/', '/.claude/worktrees/'])

function logToConsole(message: string): void {
  console.error(message)
}

// A remote URL in stderr may carry credentials (https://user:token@host).
function withoutCredentials(text: string): string {
  return text.replace(/\/\/[^/\s@]+@/g, '//***@')
}

async function git(
  cwd: string,
  args: readonly string[],
  logError: LogGitError | null,
): Promise<boolean> {
  const result = await runGit(cwd, args, GIT_TIMEOUT_MS)
  if (!result.ok && logError !== null) {
    const reason = result.timedOut ? 'timed out' : result.stderr.trim()
    logError(`[git] git ${args.join(' ')}: ${withoutCredentials(reason)}`)
  }
  return result.ok
}

// The main checkout's status must not list the worktrees as untracked files.
async function excludeWorktreesFolder(repoPath: string, logError: LogGitError): Promise<void> {
  const excludePath = join(repoPath, '.git', 'info', 'exclude')
  try {
    let text = ''
    try {
      text = await readFile(excludePath, 'utf8')
    } catch (error: unknown) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
        throw error
      }
    }
    if (text.split('\n').some((line) => IGNORED_FOLDERS.has(line.trim()))) {
      return
    }
    await mkdir(dirname(excludePath), { recursive: true })
    const separator = text === '' || text.endsWith('\n') ? '' : '\n'
    await appendFile(excludePath, `${separator}/.claude/worktrees/\n`)
  } catch (error: unknown) {
    logError(`[git] Excluding .claude/worktrees in ${repoPath} failed: ${String(error)}`)
  }
}

// Port of WorktreeService.Create: fetch, then a branch cut from the base, or the existing branch with the base merged in.
export async function createWorktree(
  options: WorktreeOptions,
  logError: LogGitError = logToConsole,
): Promise<WorktreeResult> {
  const { ticketKey, repoPath, worktreePath, parentKey } = options
  if (!(await git(repoPath, ['fetch', 'origin'], logError))) {
    return 'failed'
  }
  // A sub-task never falls back to main: its PR goes into the parent's branch.
  const baseRef = parentKey === null ? 'origin/main' : `origin/${parentKey}`
  const verify = (ref: string): Promise<boolean> =>
    git(repoPath, ['--no-optional-locks', 'rev-parse', '--verify', '--quiet', ref], null)
  if (parentKey !== null && !(await verify(`refs/remotes/${baseRef}`))) {
    return 'parentBranchMissing'
  }
  // A missing branch is the normal case, so these reads are not logged.
  const hasBranch =
    (await verify(`refs/heads/${ticketKey}`)) || (await verify(`refs/remotes/origin/${ticketKey}`))
  await excludeWorktreesFolder(repoPath, logError)
  const recordParent = (): Promise<boolean> =>
    parentKey === null
      ? Promise.resolve(true)
      : git(repoPath, ['config', `branch.${ticketKey}.parentTicket`, parentKey], logError)
  if (!hasBranch) {
    const added = await git(repoPath, ['worktree', 'add', worktreePath, '-b', ticketKey, baseRef], logError)
    return added && (await recordParent()) ? 'created' : 'failed'
  }
  if (
    !(await git(repoPath, ['worktree', 'add', worktreePath, ticketKey], logError)) ||
    !(await recordParent())
  ) {
    return 'failed'
  }
  if (await git(worktreePath, ['merge', '--no-edit', baseRef], logError)) {
    return 'created'
  }
  // Only a conflicted merge leaves MERGE_HEAD; one that never started has nothing to abort.
  const merging = await git(
    worktreePath,
    ['--no-optional-locks', 'rev-parse', '-q', '--verify', 'MERGE_HEAD'],
    null,
  )
  if (merging) {
    await git(worktreePath, ['merge', '--abort'], logError)
  }
  return 'mainNotMerged'
}
