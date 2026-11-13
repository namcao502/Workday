import { readdir } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { isDirectory } from './sessionHost.js'

export interface TicketWorktree {
  readonly repository: string
  readonly path: string
}

export function worktreePathOf(repositoryPath: string, ticketKey: string): string {
  return join(repositoryPath, '.claude', 'worktrees', ticketKey)
}

// Only "*" as prefix*suffix; any other shape matches nothing. Case-insensitive, like Windows folder names.
function matchesGlob(name: string, glob: string): boolean {
  const parts = glob.toLowerCase().split('*')
  const lower = name.toLowerCase()
  if (parts.length === 1) {
    return lower === glob.toLowerCase()
  }
  const [prefix, suffix] = parts
  if (parts.length !== 2 || prefix === undefined || suffix === undefined) {
    return false
  }
  return lower.length >= prefix.length + suffix.length && lower.startsWith(prefix) && lower.endsWith(suffix)
}

// Port of TicketWorktrees.Find: the dev repo first, then each sibling repo matching the glob that has one.
export async function findWorktrees(
  devRepoPath: string,
  siblingRepoGlob: string | null,
  ticketKey: string,
): Promise<readonly TicketWorktree[]> {
  const repo = devRepoPath.replace(/[\\/]+$/, '')
  const backendPath = worktreePathOf(repo, ticketKey)
  const found: TicketWorktree[] = isDirectory(backendPath)
    ? [{ repository: basename(repo), path: backendPath }]
    : []
  if (siblingRepoGlob === null) {
    return found
  }
  let names: string[]
  try {
    const entries = await readdir(dirname(repo), { withFileTypes: true })
    names = entries
      .filter((entry) => entry.isDirectory() && matchesGlob(entry.name, siblingRepoGlob))
      .map((entry) => entry.name)
      .filter((name) => name !== basename(repo))
      .sort((left, right) => left.toLowerCase().localeCompare(right.toLowerCase()))
  } catch {
    // An unreadable projects folder just ends the search.
    return found
  }
  for (const name of names) {
    const path = worktreePathOf(join(dirname(repo), name), ticketKey)
    if (isDirectory(path)) {
      found.push({ repository: name, path })
    }
  }
  return found
}

// The dev repo's copy first: the docs hook mirrors worktree edits up to it.
export function docsPath(devRepoPath: string, ticketKey: string): string | null {
  const roots = [devRepoPath, worktreePathOf(devRepoPath, ticketKey)]
  for (const root of roots) {
    const path = join(root, 'docs', ticketKey)
    if (isDirectory(path)) {
      return path
    }
  }
  return null
}
