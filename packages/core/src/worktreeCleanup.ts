import type { CleanupReason, CleanupVerdict } from './api.js'

// What the server read about one ticket's worktrees; the rules below turn it into a verdict.
export interface WorktreeFacts {
  readonly inspectFailed: boolean
  readonly sessionRunning: boolean
  readonly unpushedCommits: number
  readonly isBroken: boolean
  readonly dirtyFiles: number
  readonly localConfigDiffs: number
  readonly inProgress: boolean
  readonly otherBranch: string | null
  readonly hasTrackedPrs: boolean
  readonly allPrsClosed: boolean
  readonly anyPrCompleted: boolean
  readonly branchMerged: boolean
  readonly mainPrMerged: boolean
}

export interface WorktreeClassification {
  readonly verdict: CleanupVerdict
  readonly reasons: readonly CleanupReason[]
}

const MINING_LINE = /\bMining (\S+) /
const GIVING_UP_LINE = /\bGiving up on (\S+)/
const TICKET_KEY_IN_TEXT = /\b[A-Z][A-Z0-9]*-[0-9]+\b/gi
const CLEANUP_KEY = /^[A-Z][A-Z0-9]*-[0-9]+(?:-[A-Za-z0-9]+)*$/
const WORKTREES_MARKER = /[\\/]\.claude[\\/]worktrees[\\/]/i

// A ticket key or a work branch's ("MDP-1-dev"); the only shape allowed into a folder path that gets deleted.
export function isCleanupKey(key: string): boolean {
  return CLEANUP_KEY.test(key)
}

// The ticket whose worktree holds this folder (".claude/worktrees/<KEY>" or below it); null outside every worktree.
export function worktreeKeyOf(directory: string): string | null {
  const marker = WORKTREES_MARKER.exec(directory)
  if (marker === null) {
    return null
  }
  const rest = directory.slice(marker.index + marker[0].length)
  const separator = rest.search(/[\\/]/)
  return separator === -1 ? rest : rest.slice(0, separator)
}

// Tickets the knowledge scan mined: a "Giving up" line or a retry-file entry un-marks one.
export function minedTickets(scanLog: string, retryFile: string): ReadonlySet<string> {
  const mined = new Set<string>()
  for (const line of scanLog.split('\n')) {
    const mining = MINING_LINE.exec(line)?.[1]
    if (mining !== undefined) {
      mined.add(mining.toUpperCase())
      continue
    }
    const givingUp = GIVING_UP_LINE.exec(line)?.[1]
    if (givingUp !== undefined) {
      mined.delete(givingUp.toUpperCase())
    }
  }
  for (const line of retryFile.replace(/^\uFEFF/, '').split('\n')) {
    const retryKey = line.trim().split(' ')[0]
    if (retryKey !== undefined && retryKey !== '') {
      mined.delete(retryKey.toUpperCase())
    }
  }
  return mined
}

// Keys named in merge commit subjects ("Merged PR 123: MDP-1 ..."), one subject per line.
export function mergedTickets(mergeSubjects: string): ReadonlySet<string> {
  return new Set((mergeSubjects.match(TICKET_KEY_IN_TEXT) ?? []).map((key) => key.toUpperCase()))
}

// Why the branch is not shipped: abandoned PRs, a merged main PR with another still open, or plain unmerged.
function notShippedReason(facts: WorktreeFacts): CleanupReason {
  if (facts.hasTrackedPrs && facts.allPrsClosed && !facts.anyPrCompleted) {
    return { code: 'abandoned' }
  }
  return { code: facts.mainPrMerged ? 'mainMergedPrOpen' : 'notMerged' }
}

// The first three checks stop at once: removing would lose work or race a live session.
export function classifyWorktree(facts: WorktreeFacts): WorktreeClassification {
  if (facts.inspectFailed) {
    return { verdict: 'keep', reasons: [{ code: 'inspectFailed' }] }
  }
  if (facts.sessionRunning) {
    return { verdict: 'keep', reasons: [{ code: 'sessionRunning' }] }
  }
  if (facts.unpushedCommits > 0) {
    return { verdict: 'keep', reasons: [{ code: 'unpushed', count: facts.unpushedCommits }] }
  }
  const reasons: CleanupReason[] = []
  if (facts.isBroken) {
    reasons.push({ code: 'broken' })
  }
  if (facts.dirtyFiles > 0) {
    reasons.push({ code: 'dirty', count: facts.dirtyFiles })
  }
  if (facts.localConfigDiffs > 0) {
    reasons.push({ code: 'localConfig' })
  }
  if (facts.inProgress) {
    reasons.push({ code: 'inProgress' })
  }
  if (facts.otherBranch !== null) {
    reasons.push({ code: 'otherBranch', branch: facts.otherBranch })
  }
  const shipped = facts.hasTrackedPrs
    ? facts.allPrsClosed && facts.anyPrCompleted
    : facts.branchMerged
  if (!shipped) {
    reasons.push(notShippedReason(facts))
  }
  return { verdict: reasons.length !== 0 ? 'check' : 'ready', reasons }
}
