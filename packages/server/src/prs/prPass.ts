import {
  addCommentAlert,
  areAllPrsClosed,
  detectChanges,
  isDevPrMerged,
  mergeReviewRequests,
  stepsToReadyToTest,
  NetworkFailure,
  type BoardState,
  type CommentAlert,
  type DevDeploy,
  type PrRead,
  type PrReviewRequest,
  type PrTracking,
  type PullRequests,
} from '@workday/core'
import type { NoticeInput } from '../notices/noticeService.js'
import { changeNotices, devMergedNotice, reviewNotice } from './prNotices.js'
import type { PrState } from './prService.js'

export interface TicketRead {
  readonly key: string
  readonly prs: readonly PrRead[]
}

export interface PrPass {
  readonly reads: readonly TicketRead[]
  readonly complete: boolean // every ticket read in full: a usable baseline
  readonly reachable: boolean // no network failure
}

const MAIN_BRANCH = 'main'
const DEV_BRANCH = 'dev'

// In Progress, plus Done tickets with a PR still open (or none tracked yet).
function trackedKeys(board: BoardState, tracking: PrTracking): readonly string[] {
  const openDone = Object.keys(board.done).filter((key) => !areAllPrsClosed(tracking, key))
  return [...new Set([...Object.keys(board.inProgress), ...openDone])]
}

// A work branch on the board ("<KEY>-phase-2") is tracked under its own key, so its parent leaves its PRs to it.
function ownPrs(key: string, prs: readonly PrRead[], tracked: readonly string[]): PrRead[] {
  const workBranchKeys = tracked.filter((other) => other.startsWith(`${key}-`))
  return prs.filter((pr) => {
    const branchKey = `${key}-${pr.branch}`
    return (
      pr.branch === MAIN_BRANCH ||
      !workBranchKeys.some((work) => branchKey === work || branchKey.startsWith(`${work}-`))
    )
  })
}

function statusOf(board: BoardState, key: string): string | null {
  return (board.inProgress[key] ?? board.done[key])?.status ?? null
}

export function sameEntries<Value>(
  left: Readonly<Record<string, Value>>,
  right: Readonly<Record<string, Value>>,
  same: (a: Value, b: Value) => boolean,
): boolean {
  const keys = Object.keys(left)
  return (
    keys.length === Object.keys(right).length &&
    keys.every((key) => {
      const a = left[key]
      const b = right[key]
      return a !== undefined && b !== undefined && same(a, b)
    })
  )
}

function sameReview(a: PrReviewRequest, b: PrReviewRequest): boolean {
  return (
    a.repository === b.repository &&
    a.pullRequestId === b.pullRequestId &&
    a.title === b.title &&
    a.authorName === b.authorName &&
    a.ticketKey === b.ticketKey &&
    a.isRequired === b.isRequired &&
    a.url === b.url &&
    a.seen === b.seen
  )
}

export function sameDeploy(a: DevDeploy, b: DevDeploy): boolean {
  return (
    a.state === b.state &&
    a.mergedAt === b.mergedAt &&
    a.failedBuild?.buildId === b.failedBuild?.buildId
  )
}

export function sameState(a: PrState, b: PrState): boolean {
  return (
    a.tracking === b.tracking &&
    a.baselineDone === b.baselineDone &&
    a.reviews === b.reviews &&
    a.reviewBaselineDone === b.reviewBaselineDone &&
    a.commentAlerts === b.commentAlerts &&
    a.deploys === b.deploys
  )
}

// Network down: every remaining ticket would fail the same way, so the pass stops and retries next time.
export async function readPrPass(
  client: PullRequests,
  board: BoardState,
  tracking: PrTracking,
  logError: (message: string, error: unknown) => void,
): Promise<PrPass> {
  const tracked = trackedKeys(board, tracking)
  const reads: TicketRead[] = []
  let complete = true
  for (const key of tracked) {
    try {
      const lookup = await client.ticketPrs(key)
      complete = complete && lookup.complete
      reads.push({ key, prs: ownPrs(key, lookup.prs, tracked) })
    } catch (error: unknown) {
      logError(`Reading the PRs of ${key} failed`, error)
      if (error instanceof NetworkFailure) {
        return { reads, complete: false, reachable: false }
      }
      complete = false
    }
  }
  return { reads, complete, reachable: true }
}

// A ticket that left the board drops its alert; the same object when every alert stays.
function alertsOnBoard(
  alerts: Readonly<Record<string, CommentAlert>>,
  board: BoardState,
): Readonly<Record<string, CommentAlert>> {
  const kept = Object.entries(alerts).filter(
    ([key]) =>
      Object.hasOwn(board.new, key) ||
      Object.hasOwn(board.inProgress, key) ||
      Object.hasOwn(board.done, key),
  )
  return kept.length === Object.keys(alerts).length ? alerts : Object.fromEntries(kept)
}

export interface PassContext {
  readonly board: BoardState
  readonly path: readonly string[]
  readonly repoLabels: Readonly<Record<string, string>>
  readonly at: string
}

// The first complete pass only records a baseline; reviews keep their own baseline.
export function applyPass(
  state: PrState,
  pass: PrPass,
  requests: readonly PrReviewRequest[] | null,
  context: PassContext,
): { readonly state: PrState; readonly notices: readonly NoticeInput[] } {
  const isBaseline = !state.baselineDone
  const notices: NoticeInput[] = []
  const devMergedKeys = new Set<string>()
  let { tracking, commentAlerts, reviews } = state
  for (const { key, prs } of pass.reads) {
    const detected = detectChanges(tracking, key, prs)
    tracking = detected.tracking
    for (const change of isBaseline ? [] : detected.changes) {
      notices.push(...changeNotices(key, change, context.repoLabels))
      commentAlerts = addCommentAlert(
        commentAlerts,
        key,
        change.newComments,
        change.pr.url,
        context.at,
      )
      if (change.merged && change.pr.branch === DEV_BRANCH) {
        devMergedKeys.add(key)
      }
    }
  }
  // Only once every dev PR is in, and Jira still has a step to walk.
  for (const key of devMergedKeys) {
    const steps = stepsToReadyToTest(statusOf(context.board, key), context.path)
    if (isDevPrMerged(tracking, key) && steps.length !== 0) {
      notices.push(devMergedNotice(key))
    }
  }
  if (requests !== null) {
    const merged = mergeReviewRequests(reviews, requests, !state.reviewBaselineDone)
    reviews = sameEntries(reviews, merged.saved, sameReview) ? reviews : merged.saved
    notices.push(...merged.added.map(reviewNotice))
  }
  const next: PrState = {
    ...state,
    tracking,
    commentAlerts: alertsOnBoard(commentAlerts, context.board),
    baselineDone: state.baselineDone || pass.complete,
    reviews,
    reviewBaselineDone: state.reviewBaselineDone || requests !== null,
  }
  return { state: next, notices }
}
