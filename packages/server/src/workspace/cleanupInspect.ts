import { readFileSync, statSync } from 'node:fs'
import { basename, join, relative } from 'node:path'
import { areAllPrsClosed, bugBranchOf, type PrTracking, type WorktreeFacts } from '@workday/core'
import { GIT_TIMEOUT_MS, gitText, isRegistered, type LogLine } from './cleanupGit.js'
import { runGit } from './git.js'
import { entriesOf, listFiles } from './slimTargets.js'
import { worktreePathOf, type TicketWorktree } from './ticketWorktrees.js'

// The scan's own state: copied in with the worktree, only ever updated (or deleted) in the main checkout.
export const SCAN_FILE_PREFIX = '.daily-knowledge-scan.'
const IS_ANCESTOR_NO = 1

export interface InspectInput {
  readonly devRepoPath: string
  readonly ticketKey: string
  readonly worktrees: readonly TicketWorktree[]
  readonly localOnlyPaths: ReadonlySet<string>
  readonly tracking: PrTracking
  readonly inProgress: boolean
  readonly sessionRunning: boolean
  readonly logError: LogLine
}

interface WorktreeReading {
  readonly dirtyFiles: number
  readonly unpushedCommits: number
  readonly hasMergeCommit: boolean
  readonly isAncestor: boolean
  readonly isBroken: boolean
  readonly inspectFailed: boolean
  readonly otherBranch: string | null
}

const UNREAD: WorktreeReading = {
  dirtyFiles: 0,
  unpushedCommits: 0,
  hasMergeCommit: false,
  isAncestor: true,
  isBroken: false,
  inspectFailed: false,
  otherBranch: null,
}

// The folders under docs/<KEY>/bugs that are ticket keys: a QC bug's branches live in its parent's worktree.
function bugKeys(devRepoPath: string, ticketKey: string): readonly string[] {
  return entriesOf(join(devRepoPath, 'docs', ticketKey, 'bugs'))
    .filter((entry) => entry.isDirectory() && bugBranchOf(entry.name, ticketKey) === entry.name)
    .map((entry) => entry.name)
}

async function existingBranches(cwd: string, names: readonly string[]): Promise<string[]> {
  const found = await Promise.all(
    names.map(async (name) =>
      (await gitText(cwd, ['rev-parse', '--verify', '--quiet', `refs/heads/${name}`], null)) ===
      null
        ? null
        : name,
    ),
  )
  return found.filter((name): name is string => name !== null)
}

// Exit 1 of --is-ancestor means "not an ancestor"; any other failure is an unread answer, not a no.
async function ancestry(
  cwd: string,
  tip: string,
  logError: LogLine,
): Promise<'yes' | 'no' | 'unknown'> {
  const result = await runGit(
    cwd,
    ['--no-optional-locks', 'merge-base', '--is-ancestor', tip, 'origin/main'],
    GIT_TIMEOUT_MS,
  )
  if (result.ok) {
    return 'yes'
  }
  if (result.exitCode === IS_ANCESTOR_NO) {
    return 'no'
  }
  logError(
    `[cleanup] git merge-base --is-ancestor ${tip} origin/main in ${cwd}: ${result.stderr.trim()}`,
  )
  return 'unknown'
}

function countDirty(porcelain: string, localOnly: ReadonlySet<string>): number {
  return porcelain
    .split('\n')
    .filter((line) => line.length > 3 && !localOnly.has(line.slice(3).trim().toLowerCase())).length
}

async function readWorktree(
  input: InspectInput,
  worktree: TicketWorktree,
  bugBranches: readonly string[],
): Promise<WorktreeReading> {
  const { ticketKey, logError } = input
  const registered = await isRegistered(worktree, logError)
  // Without its admin entry, git run in the folder would read the main checkout instead.
  if (registered === null) {
    return { ...UNREAD, inspectFailed: true }
  }
  if (!registered) {
    return { ...UNREAD, isBroken: true }
  }
  const cwd = worktree.path
  const ticketBranches = await existingBranches(cwd, [ticketKey, `${ticketKey}-dev`])
  const bugRefs = await existingBranches(cwd, bugBranches)
  const refs = [...ticketBranches, ...bugRefs].map((name) => `refs/heads/${name}`)
  const status = await gitText(cwd, ['status', '--porcelain'], logError)
  // Commits on no remote-tracking branch: the only work a removal could lose.
  const unpushed = await gitText(
    cwd,
    ['rev-list', '--count', 'HEAD', ...refs, '--not', '--remotes'],
    logError,
  )
  const current = await gitText(cwd, ['branch', '--show-current'], logError)
  // A branch with no commits of its own is always an ancestor; only a merge commit naming the key proves it shipped.
  const merge = await gitText(
    cwd,
    [
      'log',
      'origin/main',
      '--first-parent',
      '--merges',
      '-1',
      '--format=%h',
      '-E',
      `--grep=${ticketKey}([^0-9]|$)`,
    ],
    logError,
  )
  const tip = ticketBranches.includes(ticketKey) ? `refs/heads/${ticketKey}` : 'HEAD'
  const reach = await ancestry(cwd, tip, logError)
  const isOther =
    current !== null &&
    current !== '' &&
    !ticketBranches.includes(current) &&
    !bugBranches.includes(current)
  return {
    dirtyFiles: status === null ? 0 : countDirty(status, input.localOnlyPaths),
    unpushedCommits: Number.parseInt(unpushed ?? '', 10) || 0,
    hasMergeCommit: merge !== null && merge !== '',
    isAncestor: reach === 'yes',
    isBroken: false,
    inspectFailed: status === null || unpushed === null || merge === null || reach === 'unknown',
    otherBranch: isOther ? current : null,
  }
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

function sameBytes(left: string, right: string): boolean {
  return readFileSync(left).equals(readFileSync(right))
}

// Files a removal would lose: the docs hook only syncs the ticket folders back to the main checkout.
export function localConfigDiffs(devRepoPath: string, ticketKey: string): number {
  const worktreeConfig = join(worktreePathOf(devRepoPath, ticketKey), 'docs', 'local-config')
  const mainConfig = join(devRepoPath, 'docs', 'local-config')
  return listFiles(worktreeConfig, new Set())
    .filter((file) => !basename(file).startsWith(SCAN_FILE_PREFIX))
    .filter((file) => {
      const mainFile = join(mainConfig, relative(worktreeConfig, file))
      if (!isFile(mainFile)) {
        return true
      }
      try {
        return statSync(file).mtimeMs > statSync(mainFile).mtimeMs && !sameBytes(file, mainFile)
      } catch {
        // A file that cannot be compared cannot be shown safe to lose.
        return true
      }
    }).length
}

function prFacts(
  tracking: PrTracking,
  ticketKey: string,
): Pick<WorktreeFacts, 'hasTrackedPrs' | 'allPrsClosed' | 'anyPrCompleted' | 'mainPrMerged'> {
  const prs = Object.entries(tracking).filter(([key]) => key.startsWith(`${ticketKey}|`))
  const mainPrs = prs.filter(([key]) => key.startsWith(`${ticketKey}|main|`))
  return {
    hasTrackedPrs: prs.length !== 0,
    allPrsClosed: areAllPrsClosed(tracking, ticketKey),
    anyPrCompleted: prs.some(([, pr]) => pr.status === 'completed'),
    mainPrMerged: mainPrs.length !== 0 && mainPrs.every(([, pr]) => pr.status === 'completed'),
  }
}

// Everything the rules need about one ticket; git runs are read-only.
export async function inspectTicket(input: InspectInput): Promise<WorktreeFacts> {
  const { ticketKey, devRepoPath } = input
  const bugBranches = bugKeys(devRepoPath, ticketKey).flatMap((key) => [key, `${key}-dev`])
  const readings = await Promise.all(
    input.worktrees.map((worktree) => readWorktree(input, worktree, bugBranches)),
  )
  const hasMergeCommit = readings.some((reading) => reading.hasMergeCommit)
  return {
    inspectFailed: readings.some((reading) => reading.inspectFailed),
    sessionRunning: input.sessionRunning,
    unpushedCommits: readings.reduce((sum, reading) => sum + reading.unpushedCommits, 0),
    isBroken: readings.some((reading) => reading.isBroken),
    dirtyFiles: readings.reduce((sum, reading) => sum + reading.dirtyFiles, 0),
    localConfigDiffs: localConfigDiffs(devRepoPath, ticketKey),
    inProgress: input.inProgress,
    otherBranch: readings.map((reading) => reading.otherBranch).findLast((b) => b !== null) ?? null,
    branchMerged: hasMergeCommit && readings.every((reading) => reading.isAncestor),
    ...prFacts(input.tracking, ticketKey),
  }
}
