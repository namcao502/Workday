// QC bugs of the board and the fix drafts the jira-fetch-bug chain writes for them (port of TrayApp.QcBugs).
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import {
  isFixCurrent,
  parentOf,
  parseBugFix,
  type BoardState,
  type BugFix,
  type Ticket,
} from '@workday/core'
import { worktreePathOf } from './ticketWorktrees.js'

export interface QcBug {
  readonly bug: Ticket
  readonly parentKey: string
}

// Every bug in new, in progress or done whose parent is in progress or done, worked out from the board each time.
export function qcBugsOf(board: BoardState): readonly QcBug[] {
  const startedKeys = new Set(Object.keys(board.inProgress))
  const doneKeys = new Set(Object.keys(board.done))
  const found: QcBug[] = []
  for (const section of [board.new, board.inProgress, board.done]) {
    for (const ticket of Object.values(section)) {
      const parentKey = parentOf(ticket, startedKeys, doneKeys)
      if (parentKey !== null && parentKey !== ticket.key) {
        found.push({ bug: ticket, parentKey })
      }
    }
  }
  return found
}

// Only the parent is logged: a bug key stands for its parent; duplicates go.
export function loggableKeys(
  keys: readonly string[],
  parentByBug: ReadonlyMap<string, string>,
): readonly string[] {
  return [...new Set(keys.map((key) => parentByBug.get(key) ?? key))]
}

interface Draft {
  readonly text: string
  readonly modifiedAt: Date
}

// The chain writes the draft in the worktree and a hook copies it to the dev repo, so the newer copy wins.
async function newestDraft(
  devRepoPath: string,
  parentKey: string,
  bugKey: string,
): Promise<Draft | null> {
  const relative = join('docs', parentKey, 'bugs', bugKey, 'teams-post.md')
  let newest: { path: string; modifiedAt: Date } | null = null
  for (const root of [devRepoPath, worktreePathOf(devRepoPath, parentKey)]) {
    const path = join(root, relative)
    try {
      const { mtime } = await stat(path)
      if (newest === null || mtime > newest.modifiedAt) {
        newest = { path, modifiedAt: mtime }
      }
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
    }
  }
  return newest === null
    ? null
    : { text: await readFile(newest.path, 'utf8'), modifiedAt: newest.modifiedAt }
}

// The current fix of each bug that has a draft; a draft that cannot be read is logged and skipped.
export async function readBugFixes(
  bugs: readonly QcBug[],
  devRepoPath: string,
  now: Date,
  logError: (message: string) => void,
): Promise<readonly BugFix[]> {
  const fixes: BugFix[] = []
  for (const { bug, parentKey } of bugs) {
    try {
      const draft = await newestDraft(devRepoPath, parentKey, bug.key)
      if (draft !== null) {
        const fix = parseBugFix(parentKey, bug.key, draft.text, draft.modifiedAt.toISOString())
        if (isFixCurrent(fix, bug.statusCategory, now)) {
          fixes.push(fix)
        }
      }
    } catch (error: unknown) {
      logError(`[bugs] ${bug.key}: reading the fix draft failed: ${String(error)}`)
    }
  }
  return fixes
}
