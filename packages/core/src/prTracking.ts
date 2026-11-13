export type PrStatus = 'active' | 'completed' | 'abandoned'
export type PrBuild = 'unknown' | 'running' | 'succeeded' | 'failed'
export type PrMerge = 'unknown' | 'clean' | 'conflicts'
export type PrVote = 'unknown' | 'noVote' | 'approved' | 'waitingForAuthor' | 'rejected'

// One PR as Azure DevOps returns it; branch is the label: "main" for <KEY>, "dev" for <KEY>-dev, "<x>" for <KEY>-<x>.
export interface PrRead {
  readonly pullRequestId: number
  readonly repository: string
  readonly branch: string
  readonly status: PrStatus
  readonly url: string
  readonly commentCount: number
  readonly openThreadCount: number | null
  readonly build: PrBuild // read for an active PR only
  readonly merge: PrMerge
  readonly vote: PrVote
  readonly mergeCommit: string | null // completed PR only
  readonly mergedAt: string | null // ISO instant
  readonly targetBranch: string | null // without "refs/heads/"
}

export interface PrLookup {
  readonly prs: readonly PrRead[]
  readonly complete: boolean
}

export interface TrackedPr {
  readonly status: PrStatus
  readonly repository: string
  readonly url: string
  readonly commentCount: number
  readonly openThreadCount: number | null
  readonly build: PrBuild | null // null = never read: the next read is a baseline, never a change
  readonly merge: PrMerge | null
  readonly vote: PrVote | null
  readonly mergeCommit: string | null
  readonly mergedAt: string | null
  readonly targetBranch: string | null
}

export type PrTracking = Readonly<Record<string, TrackedPr>> // "<ticket>|<branch>|<pullRequestId>"

export interface PrChange {
  readonly pr: PrRead
  readonly merged: boolean
  readonly newComments: number
  readonly buildFailed: boolean
  readonly conflicted: boolean
  readonly newVote: PrVote | null // approved / waitingForAuthor / rejected only
}

export interface TicketPr {
  readonly key: string // tracking key
  readonly branch: string
  readonly pullRequestId: number
  readonly pr: TrackedPr
}

export interface PrReviewRequest {
  readonly repository: string
  readonly pullRequestId: number
  readonly title: string
  readonly authorName: string
  readonly ticketKey: string | null
  readonly isRequired: boolean
  readonly url: string
  readonly seen: boolean // the user hid its to-do; stays hidden until it leaves the list
}

export interface CommentAlert {
  readonly count: number
  readonly url: string
  readonly at: string
}

const NOTICED_VOTES: ReadonlySet<PrVote> = new Set(['approved', 'waitingForAuthor', 'rejected'])
const MAIN_BRANCH_LABEL = 'main'

function sameTracked(a: TrackedPr, b: TrackedPr): boolean {
  return (
    a.status === b.status &&
    a.repository === b.repository &&
    a.url === b.url &&
    a.commentCount === b.commentCount &&
    a.openThreadCount === b.openThreadCount &&
    a.build === b.build &&
    a.merge === b.merge &&
    a.vote === b.vote &&
    a.mergeCommit === b.mergeCommit &&
    a.mergedAt === b.mergedAt &&
    a.targetBranch === b.targetBranch
  )
}

// A closed PR's state is not read; an unread build or merge (a failed read, a merge still queued) keeps the stored one.
function nextTracked(pr: PrRead, previous: TrackedPr | undefined): TrackedPr {
  const active = pr.status === 'active'
  let build = previous?.build ?? null
  let merge = previous?.merge ?? null
  let vote = previous?.vote ?? null
  if (active) {
    build = pr.build !== 'unknown' ? pr.build : (build ?? 'unknown')
    merge = pr.merge !== 'unknown' ? pr.merge : (merge ?? 'unknown')
    vote = pr.vote
  }
  return {
    status: pr.status,
    repository: pr.repository,
    url: pr.url,
    commentCount: pr.commentCount,
    openThreadCount: pr.openThreadCount,
    build,
    merge,
    vote,
    mergeCommit: pr.mergeCommit ?? previous?.mergeCommit ?? null,
    mergedAt: pr.mergedAt ?? previous?.mergedAt ?? null,
    targetBranch: pr.targetBranch ?? previous?.targetBranch ?? null,
  }
}

function changeOf(pr: PrRead, previous: TrackedPr, current: TrackedPr): PrChange | null {
  const active = pr.status === 'active'
  const merged = previous.status !== 'completed' && pr.status === 'completed'
  const newComments = Math.max(0, pr.commentCount - previous.commentCount)
  // A null previous state was saved before it was read: a baseline, never a change.
  const buildFailed =
    active && previous.build !== null && previous.build !== 'failed' && current.build === 'failed'
  const conflicted =
    active &&
    previous.merge !== null &&
    previous.merge !== 'conflicts' &&
    current.merge === 'conflicts'
  const newVote =
    active && previous.vote !== null && previous.vote !== pr.vote && NOTICED_VOTES.has(pr.vote)
      ? pr.vote
      : null
  if (!merged && newComments === 0 && !buildFailed && !conflicted && newVote === null) {
    return null
  }
  return { pr, merged, newComments, buildFailed, conflicted, newVote }
}

// A PR seen for the first time only records its baseline. Returns the very same tracking when no entry differs.
export function detectChanges(
  tracking: PrTracking,
  ticketKey: string,
  prs: readonly PrRead[],
): { readonly tracking: PrTracking; readonly changes: readonly PrChange[] } {
  const changes: PrChange[] = []
  const updates: Record<string, TrackedPr> = {}
  for (const pr of prs) {
    const key = `${ticketKey}|${pr.branch}|${String(pr.pullRequestId)}`
    const previous: TrackedPr | undefined = tracking[key]
    const current = nextTracked(pr, previous)
    if (previous !== undefined) {
      const change = changeOf(pr, previous, current)
      if (change !== null) {
        changes.push(change)
      }
    }
    if (previous === undefined || !sameTracked(previous, current)) {
      updates[key] = current
    }
  }
  if (Object.keys(updates).length === 0) {
    return { tracking, changes }
  }
  return { tracking: { ...tracking, ...updates }, changes }
}

function ticketEntries(tracking: PrTracking, prefix: string): TrackedPr[] {
  return Object.entries(tracking)
    .filter(([key]) => key.startsWith(prefix))
    .map(([, pr]) => pr)
}

// The "<TICKET>-dev" PRs (one per repo) target development; the ticket is ready once every non-abandoned one merged.
export function isDevPrMerged(tracking: PrTracking, ticketKey: string): boolean {
  const devPrs = ticketEntries(tracking, `${ticketKey}|dev|`).filter(
    (pr) => pr.status !== 'abandoned',
  )
  return devPrs.length !== 0 && devPrs.every((pr) => pr.status === 'completed')
}

// A ticket with no PR tracked yet is not "closed": its PR may not exist yet.
export function areAllPrsClosed(tracking: PrTracking, ticketKey: string): boolean {
  const prs = ticketEntries(tracking, `${ticketKey}|`)
  return prs.length !== 0 && prs.every((pr) => pr.status === 'completed' || pr.status === 'abandoned')
}

// " -> MDP-1" for a PR into anything but main or development, else "".
export function targetSuffix(targetBranch: string | null): string {
  if (targetBranch === null || targetBranch === 'main' || targetBranch === 'development') {
    return ''
  }
  return ` -> ${targetBranch}`
}

// An open PR that waits on the user: build failed, conflicts, or a reviewer asked for changes. An approval waits on the lead.
export function isBlocked(pr: TrackedPr): boolean {
  return (
    pr.status === 'active' &&
    (pr.build === 'failed' ||
      pr.merge === 'conflicts' ||
      pr.vote === 'waitingForAuthor' ||
      pr.vote === 'rejected')
  )
}

export function repoLabel(
  repository: string,
  repoLabels: Readonly<Record<string, string>>,
): string {
  return Object.hasOwn(repoLabels, repository) ? (repoLabels[repository] ?? repository) : repository
}

function repoRank(repository: string, repoLabels: Readonly<Record<string, string>>): number {
  const index = Object.keys(repoLabels).indexOf(repository)
  return index < 0 ? Number.MAX_SAFE_INTEGER : index
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

// The latest PR (highest id) per repo + branch; repos in the configured label order, main before other branches.
export function latestPrs(
  ticketKey: string,
  tracking: PrTracking,
  repoLabels: Readonly<Record<string, string>>,
): readonly TicketPr[] {
  const latest = new Map<string, TicketPr>()
  for (const [key, pr] of Object.entries(tracking)) {
    const parts = key.split('|')
    const pullRequestId = Number(parts[2])
    if (parts.length !== 3 || parts[0] !== ticketKey || !Number.isInteger(pullRequestId)) {
      continue
    }
    const branch = parts[1] ?? ''
    const groupKey = `${pr.repository}|${branch}`
    const existing = latest.get(groupKey)
    if (existing === undefined || existing.pullRequestId < pullRequestId) {
      latest.set(groupKey, { key, branch, pullRequestId, pr })
    }
  }
  return [...latest.values()].sort(
    (a, b) =>
      repoRank(a.pr.repository, repoLabels) - repoRank(b.pr.repository, repoLabels) ||
      compareText(a.pr.repository, b.pr.repository) ||
      Number(b.branch === MAIN_BRANCH_LABEL) - Number(a.branch === MAIN_BRANCH_LABEL) ||
      compareText(a.branch, b.branch),
  )
}

// Done tickets whose main PRs all merged: the latest per repo, abandoned ones left out, at least one left.
export function shippedKeys(
  doneKeys: readonly string[],
  tracking: PrTracking,
  repoLabels: Readonly<Record<string, string>>,
): readonly string[] {
  return [...doneKeys].sort(compareText).filter((ticketKey) => {
    const mainPrs = latestPrs(ticketKey, tracking, repoLabels).filter(
      (tp) => tp.branch === MAIN_BRANCH_LABEL && tp.pr.status !== 'abandoned',
    )
    return mainPrs.length !== 0 && mainPrs.every((tp) => tp.pr.status === 'completed')
  })
}

export function reviewRequestKey(request: PrReviewRequest): string {
  return `${request.repository}|${String(request.pullRequestId)}`
}

// A request that left the list and comes back (its vote was reset on a push) is new again.
export function mergeReviewRequests(
  previous: Readonly<Record<string, PrReviewRequest>>,
  current: readonly PrReviewRequest[],
  isBaseline: boolean,
): {
  readonly saved: Readonly<Record<string, PrReviewRequest>>
  readonly added: readonly PrReviewRequest[]
} {
  const saved: Record<string, PrReviewRequest> = {}
  const added: PrReviewRequest[] = []
  for (const request of current) {
    const key = reviewRequestKey(request)
    const before: PrReviewRequest | undefined = previous[key]
    if (before !== undefined) {
      saved[key] = { ...request, seen: before.seen }
      continue
    }
    saved[key] = request
    if (!isBaseline) {
      added.push(request)
    }
  }
  return { saved, added }
}

// Adds to the ticket's unseen count; the latest PR url wins, so the key opens the most recently commented PR.
export function addCommentAlert(
  alerts: Readonly<Record<string, CommentAlert>>,
  ticketKey: string,
  count: number,
  url: string,
  at: string,
): Readonly<Record<string, CommentAlert>> {
  if (count <= 0) {
    return alerts
  }
  const previous: CommentAlert | undefined = alerts[ticketKey]
  return { ...alerts, [ticketKey]: { count: (previous?.count ?? 0) + count, url, at } }
}
