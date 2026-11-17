import { readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { activeMinutes, claudeProjectDirName, type DayTicketActivity } from '@workday/core'
import { nextDay, offsetOf, repositoriesOf, type RunGit } from '../insights/commitReader.js'
import { runGit } from '../workspace/git.js'
import { findWorktrees } from '../workspace/ticketWorktrees.js'

const GIT_TIMEOUT_MS = 30_000
const CONFIG_TIMEOUT_MS = 10_000
const TIMESTAMP = /"timestamp"\s*:\s*"([^"]+)"/g

export interface DayActivityOptions {
  readonly devRepoPath: string
  readonly siblingRepoGlob: string | null
  readonly projectsRoot: string // ~/.claude/projects
  readonly projectKey: string
  readonly timeZone: string
  readonly date: string // "YYYY-MM-DD"
  readonly keys: readonly string[] // the tickets to look for
}

interface Bounds {
  readonly startMs: number
  readonly endMs: number
}

function boundsOf(date: string, timeZone: string): Bounds {
  const end = nextDay(date)
  return {
    startMs: Date.parse(`${date}T00:00:00${offsetOf(timeZone, date)}`),
    endMs: Date.parse(`${end}T00:00:00${offsetOf(timeZone, end)}`),
  }
}

// Commit times by ticket key over the day, from the user's own first-parent history in every repo.
async function commitTimes(
  options: DayActivityOptions,
  bounds: Bounds,
  run: RunGit,
): Promise<Map<string, number[]>> {
  const keyPattern = new RegExp(`(?:^|/)(${options.projectKey}-[0-9]+)$`, 'i')
  const times = new Map<string, number[]>()
  for (const repository of repositoriesOf(options.devRepoPath, options.siblingRepoGlob)) {
    const email = await run(repository, ['config', 'user.email'], CONFIG_TIMEOUT_MS)
    const log = await run(
      repository,
      [
        '--no-optional-locks',
        'log',
        '--first-parent',
        '--no-merges',
        '--source',
        `--since=${new Date(bounds.startMs).toISOString()}`,
        `--until=${new Date(bounds.endMs).toISOString()}`,
        ...(email.ok && email.stdout.trim() !== '' ? [`--author=${email.stdout.trim()}`] : []),
        '--format=%H%x09%S%x09%ct',
        `--branches=${options.projectKey}-*`,
        `--remotes=origin/${options.projectKey}-*`,
      ],
      GIT_TIMEOUT_MS,
    )
    if (!log.ok) {
      continue
    }
    const seen = new Set<string>()
    for (const line of log.stdout.split('\n')) {
      const [hash = '', source = '', seconds = ''] = line.trim().split('\t')
      const key = keyPattern.exec(source)?.[1]?.toUpperCase()
      const at = Number(seconds) * 1000
      // The same commit shows under the local and the remote branch.
      if (key === undefined || hash === '' || Number.isNaN(at) || seen.has(hash)) {
        continue
      }
      seen.add(hash)
      times.set(key, [...(times.get(key) ?? []), at])
    }
  }
  return times
}

// Timestamps inside the day from the ticket's Claude session files; only files touched since the day began are read.
async function claudeTimes(
  options: DayActivityOptions,
  bounds: Bounds,
  key: string,
): Promise<number[]> {
  const worktrees = await findWorktrees(options.devRepoPath, options.siblingRepoGlob, key)
  const times: number[] = []
  for (const worktree of worktrees) {
    const directory = join(options.projectsRoot, claudeProjectDirName(worktree.path))
    let names: string[]
    try {
      names = (await readdir(directory)).filter((name) => name.endsWith('.jsonl'))
    } catch {
      continue // no sessions for this worktree
    }
    for (const name of names) {
      try {
        const file = join(directory, name)
        if ((await stat(file)).mtimeMs < bounds.startMs) {
          continue
        }
        for (const match of (await readFile(file, 'utf8')).matchAll(TIMESTAMP)) {
          const at = Date.parse(match[1] ?? '')
          if (at >= bounds.startMs && at < bounds.endMs) {
            times.push(at)
          }
        }
      } catch {
        // A session file that cannot be read adds nothing.
      }
    }
  }
  return times
}

// What each of the given tickets had on the day: own commits and Claude work, in five-minute active slots.
export async function readDayActivity(
  options: DayActivityOptions,
  run: RunGit = runGit,
): Promise<Readonly<Record<string, DayTicketActivity>>> {
  const bounds = boundsOf(options.date, options.timeZone)
  const commits = await commitTimes(options, bounds, run)
  const result: Record<string, DayTicketActivity> = {}
  for (const key of options.keys) {
    const committed = commits.get(key.toUpperCase()) ?? []
    const claude = await claudeTimes(options, bounds, key)
    const claudeLast = claude.length === 0 ? null : new Date(Math.max(...claude)).toISOString()
    result[key] = {
      ticketKey: key,
      commits: committed.length,
      claudeLast,
      activeMinutes: activeMinutes([...committed, ...claude], bounds.startMs, bounds.endMs),
    }
  }
  return result
}
