import { existsSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { mergedTickets } from '@workday/core'
import { runGit } from './git.js'
import { matchesGlob, type TicketWorktree } from './ticketWorktrees.js'

export type LogLine = (message: string) => void

export const GIT_TIMEOUT_MS = 2 * 60_000
const MERGE_TARGET_BRANCHES = ['origin/main', 'origin/development']
const LISTED_PREFIX = 'worktree '

// Read-only (--no-optional-locks), so it never collides with Claude's git. Null on failure; logged unless logError is null.
export async function gitText(
  cwd: string,
  args: readonly string[],
  logError: LogLine | null,
): Promise<string | null> {
  const result = await runGit(cwd, ['--no-optional-locks', ...args], GIT_TIMEOUT_MS)
  if (result.ok) {
    return result.stdout.trimEnd()
  }
  logError?.(`[cleanup] git ${args.join(' ')} in ${cwd}: ${result.stderr.trim()}`)
  return null
}

// The folder holding .claude/worktrees/<KEY>.
export function repoOf(worktreePath: string): string {
  return resolve(worktreePath, '..', '..', '..')
}

function comparable(path: string): string {
  const slashed = resolve(path).replaceAll('\\', '/')
  return process.platform === 'win32' ? slashed.toLowerCase() : slashed
}

// Null when git cannot list: only a real "not listed" may delete a folder.
// git lists resolved paths, so rebuild from the main entry.
export async function isRegistered(
  worktree: TicketWorktree,
  logError: LogLine,
): Promise<boolean | null> {
  const repo = repoOf(worktree.path)
  // -z: without it git may C-quote a path holding unusual characters, which would then never match.
  const list = await gitText(repo, ['worktree', 'list', '--porcelain', '-z'], logError)
  if (list === null) {
    return null
  }
  const listed = list
    .split('\0')
    .filter((line) => line.startsWith(LISTED_PREFIX))
    .map((line) => line.slice(LISTED_PREFIX.length))
  const [main, ...others] = listed
  if (main === undefined) {
    return null
  }
  const expected = comparable(join(main, relative(repo, resolve(worktree.path))))
  return others.some((path) => comparable(path) === expected)
}

// The dev repo's sibling folders matching the glob that are git repos (a .git folder or file).
export async function siblingRepos(
  devRepoPath: string,
  siblingRepoGlob: string | null,
): Promise<readonly string[]> {
  if (siblingRepoGlob === null) {
    return []
  }
  const parent = dirname(devRepoPath)
  try {
    const entries = await readdir(parent, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isDirectory() && matchesGlob(entry.name, siblingRepoGlob))
      .filter((entry) => entry.name !== basename(devRepoPath))
      .map((entry) => join(parent, entry.name))
      .filter((path) => existsSync(join(path, '.git')))
  } catch {
    return []
  }
}

// Tickets named by a merge commit on origin/main or development, in any repo: one log per repo and branch.
export async function mergedKeys(
  devRepoPath: string,
  siblingRepoGlob: string | null,
): Promise<ReadonlySet<string>> {
  const repos = [devRepoPath, ...(await siblingRepos(devRepoPath, siblingRepoGlob))]
  const logs = await Promise.all(
    repos.flatMap((repo) =>
      MERGE_TARGET_BRANCHES.map((branch) =>
        // A repo without a development branch just adds nothing, so a failure is not logged.
        gitText(repo, ['log', branch, '--first-parent', '--merges', '--format=%s'], null),
      ),
    ),
  )
  return mergedTickets(logs.filter((log): log is string => log !== null).join('\n'))
}
