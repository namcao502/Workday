import { runGit } from './git.js'

const GIT_TIMEOUT_MS = 5_000
const SHORTSTAT = /(\d+) insertions?\(\+\)|(\d+) deletions?\(-\)/g

export interface GitStatus {
  readonly branch: string | null
  readonly added: number
  readonly removed: number
}

// "3 files changed, 10 insertions(+), 2 deletions(-)" -> added 10, removed 2.
export function parseShortstat(text: string): { added: number; removed: number } {
  let added = 0
  let removed = 0
  for (const match of text.matchAll(SHORTSTAT)) {
    added += Number(match[1] ?? 0)
    removed += Number(match[2] ?? 0)
  }
  return { added, removed }
}

// The branch and the lines changed since it left origin/main (working tree included); empty outside a repo.
export async function readGitStatus(cwd: string): Promise<GitStatus> {
  const read = (...args: string[]): ReturnType<typeof runGit> =>
    runGit(cwd, ['--no-optional-locks', ...args], GIT_TIMEOUT_MS)
  const branch = await read('branch', '--show-current')
  if (!branch.ok) {
    return { branch: null, added: 0, removed: 0 }
  }
  const mergeBase = await read('merge-base', 'HEAD', 'origin/main')
  const base = mergeBase.ok ? mergeBase.stdout.trim() : 'HEAD'
  const stat = await read('diff', '--shortstat', base)
  const name = branch.stdout.trim()
  return {
    branch: name === '' ? null : name,
    ...(stat.ok ? parseShortstat(stat.stdout) : { added: 0, removed: 0 }),
  }
}

// The chat refetches on every message, and `git diff --shortstat` over a big repo takes a few hundred ms:
// a result is reused for a few seconds, and callers that arrive meanwhile share the one running read.
const STATUS_TTL_MS = 5_000
const recentStatus = new Map<string, { readonly at: number; readonly status: Promise<GitStatus> }>()

export function readGitStatusCached(cwd: string, now: () => number = Date.now): Promise<GitStatus> {
  const recent = recentStatus.get(cwd)
  if (recent !== undefined && now() - recent.at < STATUS_TTL_MS) {
    return recent.status
  }
  const status = readGitStatus(cwd)
  recentStatus.set(cwd, { at: now(), status })
  return status
}
