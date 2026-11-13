import { existsSync, readdirSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { addCommits, parseNumstat, type TicketCommitStats } from '@workday/core'
import { runGit, type GitResult } from '../workspace/git.js'
import { matchesGlob } from '../workspace/ticketWorktrees.js'

// A numstat log over a month is far bigger than a one-day commit list.
const GIT_TIMEOUT_MS = 60_000
const CONFIG_TIMEOUT_MS = 10_000

export type RunGit = (cwd: string, args: readonly string[], timeoutMs: number) => Promise<GitResult>

export interface CommitReadOptions {
  readonly devRepoPath: string
  readonly siblingRepoGlob: string | null
  readonly branchPrefix: string // "MDP-"
  readonly from: string // "YYYY-MM-DD", inclusive
  readonly to: string // inclusive
  readonly timeZone: string
  readonly onFailure?: (message: string) => void // never carries commit content
}

// "+07:00" for the zone at noon UTC of the given day.
function offsetOf(timeZone: string, day: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'longOffset',
  }).formatToParts(new Date(`${day}T12:00:00Z`))
  const name = parts.find((part) => part.type === 'timeZoneName')?.value ?? 'GMT'
  return name === 'GMT' ? '+00:00' : name.replace('GMT', '')
}

function nextDay(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)
}

// The dev repo, then each sibling repo (with a .git) matching the glob.
export function repositoriesOf(devRepoPath: string, siblingRepoGlob: string | null): string[] {
  const repo = devRepoPath.replace(/[\\/]+$/, '')
  const repositories = [repo]
  if (siblingRepoGlob === null) {
    return repositories
  }
  try {
    const names = readdirSync(dirname(repo), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && matchesGlob(entry.name, siblingRepoGlob))
      .map((entry) => entry.name)
      .filter((name) => name !== basename(repo) && existsSync(join(dirname(repo), name, '.git')))
      .sort((left, right) => left.toLowerCase().localeCompare(right.toLowerCase()))
    repositories.push(...names.map((name) => join(dirname(repo), name)))
  } catch {
    // An unreadable projects folder ends the search.
  }
  return repositories
}

// Each ticket's commits, files and lines over a range from the user's own first-parent history in every repo.
export async function readCommits(
  options: CommitReadOptions,
  run: RunGit = runGit,
): Promise<Readonly<Record<string, TicketCommitStats>>> {
  const offset = offsetOf(options.timeZone, options.from)
  const since = `${options.from}T00:00:00${offset}`
  const until = `${nextDay(options.to)}T00:00:00${offsetOf(options.timeZone, nextDay(options.to))}`
  let total: Readonly<Record<string, TicketCommitStats>> = {}

  for (const repository of repositoriesOf(options.devRepoPath, options.siblingRepoGlob)) {
    const email = await run(repository, ['config', 'user.email'], CONFIG_TIMEOUT_MS)
    // No ^origin/main: main's first-parent history is merge commits only, which --no-merges drops.
    const args = [
      '--no-optional-locks',
      'log',
      '--first-parent',
      '--no-merges',
      '--source',
      `--since=${since}`,
      `--until=${until}`,
      ...(email.ok && email.stdout.trim() !== '' ? [`--author=${email.stdout.trim()}`] : []),
      '--format=%x1e%H%x09%S%x09%ct',
      '--numstat',
      `--branches=${options.branchPrefix}*`,
      `--remotes=origin/${options.branchPrefix}*`,
    ]
    const log = await run(repository, args, GIT_TIMEOUT_MS)
    if (!log.ok) {
      options.onFailure?.(`[report] git log in ${repository} failed (${String(log.exitCode)})`)
      continue
    }
    total = addCommits(total, parseNumstat(log.stdout, options.branchPrefix))
  }
  return total
}
